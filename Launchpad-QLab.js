//CONFIG
var midiPort = 1;
var host = "127.0.0.1";
//END CONFIG

function parseColor(color) {
    switch(color) {
        case "none":
            return 3;
        case "red":
            return 5;
        case "orange":
            return 9;
        case "green":
            return 21;
        case "blue":
            return 45;
        case "purple":
            return 49;
        default:
            return 0;
    }
}

function parseColorMuted(color) {
    return 0;
}

function setButtonColor(x, y, color, blink) {
    x = 9 - x;
    x = x * 10;

    if (blink) {
        output.sendMessage([145, x + y, color]);
    } else {
        output.sendMessage([144, x + y, color]);
    }
}

var osc = require("osc");
//const net = require('net');
const process = require('process');
const fs = require('fs');
const midi = require('midi');
var log = []; //Log to sum and write to disk

var workspace; //Workspace uniqueID
var cueList = []; //Master list of cues, populated once when starting
var runningCues = []; //List of currently running cues
var startTime = []; //Start time of cues

//MIDI CONNECTION
const output = new midi.Output();
console.log("MIDI PORTS:");
for (var x = 0; x < output.getPortCount(); x++) {
    console.log("Port " + x + ": " +output.getPortName(x));
}

console.log("\nOpening MIDI port " + midiPort + "\n");
output.openPort(midiPort);
console.log("Control + C to quit");
//END MIDI CONNECTION

//Turn off all buttons.
for (x = 0; x < 10; x++) {
    for (y = 0; y < 10; y++) {
        setButtonColor(x, y, 0);
    }
}
//Set stop button as red (8,9 instead of 9,9 because we ignore the top row)
setButtonColor(8, 9, parseColor("red"));

//Open connection to client
var client = new osc.TCPSocketPort({});
client.open(host, 53000);

client.on("ready", function () {
    client.send({
        address: "/connect"});
});

function findCues(rawCueList) {
    //console.log(rawCueList);
    //console.log(rawCueList.uniqueID + " " + rawCueList.listName + " " + rawCueList.type);
    cueList.push(rawCueList);
    if (rawCueList.hasOwnProperty("cues")) {
        //console.log(rawCueList.cues);
        rawCueList.cues.forEach(function(cue) {
            findCues(cue);
            //console.log(cue.uniqueID);
        });
    }
}

client.on("message", function (oscMsg, timeTag, info) {
    //console.log("=====> ", oscMsg);
    //console.log("Remote info is: ", info);

    //Subscribe to workspace updates
    var reWorkspace = /\/reply\/workspace\/(.*?)\/connect/g;
    if (reWorkspace.test(oscMsg.address)) {
        reWorkspace.lastIndex = 0;
        var result = reWorkspace.exec(oscMsg.address);
        //console.log("Workspace ID: ", result[1]);
        workspace = result[1];
        
        var message = {};
        message['address'] = "/workspace/" + workspace + "/updates"
        message['args'] = {type: "i", value: 1};
        client.send(message);

        var message = {};
        message['address'] = "/workspace/" + workspace + "/cueLists"
        client.send(message);
        return;
    }

    //Get cue list
    var reCueList = new RegExp("\/reply\/workspace\/" + workspace + "\/cueLists", "g");
    if (reCueList.test(oscMsg.address)) {
        reCueList.lastIndex = 0;

        //console.log(oscMsg);
        //cueList = JSON.parse(oscMsg.args[0]).data[0].cues;

        var newCueList = JSON.parse(oscMsg.args[0]).data;

        //console.log(newCueList);

        for (data in newCueList) {
            findCues(newCueList[data]);
        }

        cueList.forEach(function(cue) {
            var message = {};
            message['address'] = "/cue_id/" + cue.uniqueID + "/cartPosition"
            client.send(message);
        });
        
        //console.log(cueList);
        return;
    }

    //Parse cue positions and ad to cue list
    var reCuePosition = /\/reply\/cue_id\/(.*?)\/cartPosition/g;
    if (reCuePosition.test(oscMsg.address)) {
        reCuePosition.lastIndex = 0;

        var result = reCuePosition.exec(oscMsg.address);
        //console.log(result[1]);

        var index = cueList.findIndex(function(cue) {
            return cue.uniqueID == result[1];
        });

        //console.log(JSON.parse(oscMsg.args[0]).data);

        location = JSON.parse(oscMsg.args[0]).data

        cueList[index]['cartPosition'] = location;

        var x = 9 - location[0];
        var x = x * 10;
        var y = location[1];
        var color = parseColor(cueList[index].colorName);

        output.sendMessage([144, x + y, color]);

        //console.log(cueList);
        return;
        
    }

    //Get cue list
    var reRunningCues = new RegExp("\/reply\/workspace\/" + workspace + "\/runningOrPausedCues\/uniqueIDs", "g");
    if (reRunningCues.test(oscMsg.address)) {
        reRunningCues.lastIndex = 0;

        //console.log(JSON.parse(oscMsg.args[0]).data);

        var currentlyRunningCues = []; //Currently running according to this function

        JSON.parse(oscMsg.args[0]).data.forEach(function(cueID) {
            currentlyRunningCues.push(cueID.uniqueID);
        });

        //Filtering out Group and Start cues from logging, for simplicity (and because Start cues will show up for short periods, which isn't useful)
        currentlyRunningCues = currentlyRunningCues.filter(function (cueID) {
            var cue = cueList.find(function(cue) {
                return cue.uniqueID == cueID;
            });
            if (cue.type == "Group" || cue.type == "Start") {
                return false;
            } else {
                return true;
            }
        });

        ///let difference = arr1.filter(x => !arr2.includes(x));

        var stoppedCueIDs = runningCues.filter(x => !currentlyRunningCues.includes(x));

        stoppedCueIDs.forEach(function(stoppedCueID) {
            var stoppedCue = cueList.find(function(cue) {
                return cue.uniqueID == stoppedCueID;
            });

            var stop = new Date().getTime();

            console.log("Stopped: " + stoppedCue.listName + " played for " + (stop - startTime[stoppedCue.uniqueID])/1000 + " seconds");
            
            log.push({
                uniqueID: stoppedCue.uniqueID,
                start: startTime[stoppedCue.uniqueID],
                stop: stop
            });

            delete startTime[stoppedCue.uniqueID];

            setButtonColor(stoppedCue.cartPosition[0], stoppedCue.cartPosition[1], parseColor(stoppedCue.colorName));
        });

        var startedCueIDs = currentlyRunningCues.filter(x => !runningCues.includes(x));

        startedCueIDs.forEach(function(startedRunningCueID) {
            //console.log(startedRunningCueID);
            var startedCue = cueList.find(function(cue) {
                return cue.uniqueID == startedRunningCueID;
            });

            console.log("Started: " + startedCue.listName);
            startTime[startedCue.uniqueID] = new Date().getTime();
            setButtonColor(startedCue.cartPosition[0], startedCue.cartPosition[1], parseColorMuted(startedCue.colorName), true);
        });

        runningCues = currentlyRunningCues;

        return;
    }
});

//Query for running cues every quarter second. Dirty, but effective.
setInterval(function() {
    var message = {};
    message['address'] = "/workspace/" + workspace + "/runningOrPausedCues/uniqueIDs";
    client.send(message);
}, 250);

process.on('SIGINT', (code) => {
    var finalLog = "Music log for show on " + new Date() + "\n";

    var totals = new Map();
    var count = new Map();

    log.forEach(function(logItem) {
        if (totals.has(logItem.uniqueID)) {
            totals.set(logItem.uniqueID, totals.get(logItem.uniqueID) + ((logItem.stop - logItem.start) / 1000));
            count.set(logItem.uniqueID, count.get(logItem.uniqueID) + 1);
        } else {
            totals.set(logItem.uniqueID, (logItem.stop - logItem.start) / 1000);
            count.set(logItem.uniqueID, 1);
        }
        var totalCue = cueList.find(function(cue) {
            return cue.uniqueID == logItem.uniqueID;
        });
        finalLog += totalCue.listName + " | " + ((logItem.stop - logItem.start) / 1000) + "\n";
    });

    finalLog += "==Totals==\n";
    console.log("==Totals==");

    totals.forEach(function(seconds, uniqueID) {
        var totalCue = cueList.find(function(cue) {
            return cue.uniqueID == uniqueID;
        });
        console.log(totalCue.listName + " | " + count.get(uniqueID) + " plays | " + seconds + " seconds");
        finalLog += totalCue.listName + " | " + count.get(uniqueID) + " plays | " + seconds + " seconds\n";
    });

    var writeTime = new Date().getTime();
    fs.writeFileSync("Show" + writeTime + ".txt", finalLog);
    console.log("Wrote \"Show" + writeTime + ".txt\" to disk.");

    process.exit(1);
});