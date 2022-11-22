//CONFIG
var midiOutputPort = 1;
var midiInputPort = 1;
var host = "127.0.0.1";
//END CONFIG

var osc = require("osc");
var midi = require('midi');

//MIDI SETUP
var launchpadOutput = new midi.Output();
var launchpadInput = new midi.Input();

//List MIDI ports
console.log("MIDI OUTPUT PORTS:");
for (var x = 0; x < launchpadOutput.getPortCount(); x++) {
    console.log("Port " + x + ": " + launchpadOutput.getPortName(x));
}

console.log("\nMIDI INPUT PORTS:");
for (var x = 0; x < launchpadInput.getPortCount(); x++) {
    console.log("Port " + x + ": " + launchpadInput.getPortName(x));
}

console.log("\nOpening MIDI ports " + midiOutputPort + "," + midiInputPort + "\n");
launchpadOutput.openPort(midiOutputPort);
launchpadInput.openPort(midiInputPort);

launchpadOutput.sendMessage([240, 0, 32, 41, 2, 13, 14, 1, 247]); //Set launchpad to programmers mode

//Turn off all buttons.
for (x = 0; x < 10; x++) {
    for (y = 0; y < 10; y++) {
        setButtonColor(x, y, 0, false);
    }
}

//Set stop button as red (8,9 instead of 9,9 because we ignore the top row)
setButtonColor(8, 9, parseColor("red"), false);
//END MIDI SETUP

//Interpert QLab color to launchpad color
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
        launchpadOutput.sendMessage([144, x + y, 0]);
        launchpadOutput.sendMessage([145, x + y, color]);
    } else {
        launchpadOutput.sendMessage([144, x + y, color]);
    }
}

function clearMainButtons() {
    for (x = 0; x <= 8; x++) {
        for (y = 0; y <= 8; y++) {
            setButtonColor(x, y, 0, false);
        }
    }
}

function setButtonColorFromCueID(id) {
    cue = getCue(id);
    position = cuePositions.get(id);

    if (typeof position == "undefined") { //Position can come up empty sometimes, presumably if the cue is moving?
        //Pass
    } else {
        setButtonColor(position[0], position[1], parseColor(cue.colorName), currentlyRunningCues.has(id));
    }
}

//Open connection to client
var client = new osc.TCPSocketPort({});
client.open(host, 53000);

//Send an address only OSC message
function sendOSCAddress(address) {
    client.send({
        address: address
    });
}

//Send an OSC message with a single integer as the argument
function sendOSCInteger(address, integer) {
    client.send({
        address: address,
        args: [
            {
                type: "i",
                value: integer
            }
        ]
    });
}

//When we are connected...
client.on("ready", refreshWorkspaces);

var workspaceID;
var cueList; //List (more like tree) of current cues in the workspace
var cuePositions = new Map();
var numFirstCartCues = 0;
var cueQueryInterval;
var currentlyRunningCues = new Map(); //ID, time started

//Handle incoming /reply/workspaces and attempt to connect to first workspace
function onWorkspaces(args) {
    args = JSON.parse(args[0]);
    if (args.data.length == 0) {
        console.log("No workspaces available, retrying in 2 seconds");
        setTimeout(refreshWorkspaces, 2000);
    } else {
        console.log("Using workspace " + args.data[0].displayName + " with ID " + args.data[0].uniqueID);
        workspaceID = args.data[0].uniqueID;
        sendOSCAddress("/workspace/" + workspaceID + "/connect");
        sendOSCInteger("/updates", 1);
        sendOSCAddress("/workspace/" + workspaceID + "/cueLists");
        cueQueryInterval = setInterval(queryForRunningCues, 250);
    }
}

//Request list of workspaces in order to attempt to connect to one in onWorkspaces
function refreshWorkspaces() {
    sendOSCAddress("/workspaces");
    clearInterval(cueQueryInterval);
    workspaceID = null;
}

//Handle incoming cue list, querying cart cues for their position in the wall
function onCueLists(args) {
    //console.log("Received cue list");
    args = JSON.parse(args[0]);
    cueList = args.data;
    //console.log(JSON.stringify(cueList));


    for (group of cueList) {
        if (group.type == "Cart") {
            for (cue of group.cues) {
                sendOSCAddress("/cue_id/" + cue.uniqueID + "/cartPosition");
                numFirstCartCues++;
            }
            //console.log("Expecting " + numFirstCartCues + " cart cues");
            break;
        }
    }
}

//Returns the cue (or group) for the provided ID from the list of cues
function getCue(id) {
    for (group of cueList) {
        if (group.uniqueID == id) {
            return group;
        }
        for (cue of group.cues) {
            if (cue.uniqueID == id) {
                return cue;
            }
        }
    }
}

function resetButtonColors() { //Sets button colors without clearing everything first. This prevents flickering.
    var buttons = Array.from(Array(8), () => new Array(8));
    for (var [key, value] of cuePositions) {
        buttons[value[0]-1][value[1]-1] = key; //Subtract 1 since the positions are 1 indexed and not 0 indexed
    }
    for (var x = 0; x < 8; x++) {
        for (var y = 0; y < 8; y++) {
            if (typeof buttons[x][y] == "undefined") {
                setButtonColor(x + 1, y + 1, 0, false); //Have to return back to 1 indexed array from 0
            } else {
                setButtonColorFromCueID(buttons[x][y]);
            }
        }
    }
}

//Adds position data to both the map
function addPositionToCue(id, args) {
    args = JSON.parse(args);
    cuePositions.set(id, args.data);
    if (cuePositions.size == numFirstCartCues) {
        //console.log("All positions received, setting colors");
        resetButtonColors();
    }
}

function queryForRunningCues() {
    sendOSCAddress("/workspace/" + workspaceID + "/runningCues/uniqueIDs");
}

function onRunningCues(args) {
    args = JSON.parse(args);
    var tempRunningCues = [];
    args.data.forEach(cue => {
        if (currentlyRunningCues.has(cue.uniqueID)) {
            //Pass
        } else {
            if (cue.cues.length == 0) { //Skip cues with children, e.g. group cues.
                currentlyRunningCues.set(cue.uniqueID, Date.now());
                console.log("STARTED CUE " + cue.uniqueID);
            }
        }
        tempRunningCues.push(cue.uniqueID);
    });
    var stoppedCues = [];
    for (var [key, value] of currentlyRunningCues) {
        if (tempRunningCues.indexOf(key) == -1) { //If the cue in our list is not contained in this message, we assume it has stopped
            stoppedCues.push(key);
            currentlyRunningCues.delete(key);
        }
        setButtonColorFromCueID(key);
    }
    stoppedCues.forEach(cue => {
        console.log("STOPPED CUE " + cue);
    });
}

//Handle incoming OSC messages
client.on("message", function (oscMsg, timeTag, info) {
    address = oscMsg.address;

    switch (address) {
        case "/reply/workspaces":
            onWorkspaces(oscMsg.args);
            return;
        case "/update/workspace/" + workspaceID + "/disconnect":
            console.log("Workspace shutting down");
            refreshWorkspaces();
            return;
        case "/reply/workspace/" + workspaceID + "/cueLists":
            onCueLists(oscMsg.args);
            return;
        case "/update/workspace/" + workspaceID + "/dashboard": //No idea what these are. Don't appear to be documented, or useful.
            return;
        case "/reply/workspace/" + workspaceID + "/runningCues/uniqueIDs":
            onRunningCues(oscMsg.args);
            return;
    }

    var cuePositionMatcher = new RegExp("\/reply\/cue_id\/(.*)\/cartPosition", "g");
    if (cuePositionMatcher.test(address)) {
        cuePositionMatcher.lastIndex = 0;
        var cueID = cuePositionMatcher.exec(address)[1];
        //console.log("Received cartPosition for cue " + cueID);
        addPositionToCue(cueID, oscMsg.args);
        return;
    }

    var cueUpdateMatcher = new RegExp("\/update\/workspace\/" + workspaceID + "\/cue_id\/(.*)", "g");
    if (cueUpdateMatcher.test(address)) {
        cueUpdateMatcher.lastIndex = 0;
        var cueID = cueUpdateMatcher.exec(address)[1];
        //console.log("Cue " + cueID + " updated");
        if (cueID == "[root group of cue lists]") {
            return;
        }
        cue = getCue(cueID);
        //console.log("Something changed, reloading cue lists");
        sendOSCAddress("/workspace/" + workspaceID + "/cueLists");
        numFirstCartCues = 0;
        cuePositions.clear();
        return;
    }

    var playbackPositionMatcher = new RegExp("\/update\/workspace\/.*\/cueList\/.*\/playbackPosition", "g"); //Supress these, we don't care about them
    if (playbackPositionMatcher.test(address)) {
        return;
    }

    console.log(Date.now() + " " + oscMsg.address);
    //console.log("=====> ", oscMsg);
});

launchpadInput.on("message", function(deltaTime, message) {
    if (message[0] == 144 && message[2] == 127) {
        var x = 9 - Math.floor(message[1] / 10);
        var y = message[1] % 10;
        if (workspaceID != null) {
            for (var [key, value] of cuePositions) {
                if (value[0] == x && value[1] == y) {
                    sendOSCAddress("/cue_id/" + key + "/start");
                }
            }
        }
    } else if (message[0] == 176 && message[1] == 19 && message[2] == 127) {
        if (workspaceID != null) {
            sendOSCAddress("/workspace/" + workspaceID + "/panic");
        }
    }
});