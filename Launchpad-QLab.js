//CONFIG
var midiOutputPort = 1;
var midiInputPort = 1;
var host = "127.0.0.1";
//END CONFIG

var http = require('http');
var osc = require("osc");
var midi = require('midi');
var url = require('url');

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

//DB
const sqlite3 = require("sqlite3");
const db = new sqlite3.Database("asplay.db");
const process = require("process");

var table = `
CREATE TABLE IF NOT EXISTS asplay_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT
                       NOT NULL,
    music_cut  TEXT    NOT NULL,
    start_time INTEGER NOT NULL,
    stop_time  INTEGER NOT NULL
);
`
var statement;
db.run(table, function (err) {
    statement = db.prepare("INSERT INTO asplay_log (music_cut, start_time, stop_time) VALUES (?, ?, ?)");
});
//END DB

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
var client = new osc.TCPSocketPort({address: host, port: 53000});
client.open();

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

function formatDate(date) {
    return `${date.getFullYear()}-${("0" + (date.getMonth() + 1)).slice(-2)}-${("0" + date.getDate()).slice(-2)} ${("0" + date.getHours()).slice(-2)}:${("0" + date.getMinutes()).slice(-2)}:${("0" + date.getSeconds()).slice(-2)}`;
}

//When we are connected...
client.on("ready", refreshWorkspaces);

var workspaceID;
var cueList; //List (more like tree) of current cues in the workspace
var cuePositions = new Map();
var numFirstCartCues = 0;
var cueQueryInterval;
var currentlyRunningCues = new Map(); //ID, time started
var cueNames = new Map(); //Map of UUID, listName of all known cues that have played at least once.
var connected = true;

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
    sendOSCAddress("/workspace/" + workspaceID + "/runningCues");
}

function onRunningCues(args) {
    args = JSON.parse(args);
    var tempRunningCues = [];
    args.data.forEach(cue => {
        if (currentlyRunningCues.has(cue.uniqueID)) {
            //Pass
        } else {
            if (cue.type != "Start" && cue.type != "Group") { //Skip group and start cues.
                currentlyRunningCues.set(cue.uniqueID, Date.now());
                cueNames.set(cue.uniqueID, cue.listName);
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
            
            console.log("STOPPED CUE " + key + " " + cueNames.get(key));
            statement.run(cueNames.get(key), value, Date.now());
        }
        setButtonColorFromCueID(key);
    }
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
        case "/reply/workspace/" + workspaceID + "/runningCues":
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

client.on("error", function(error) {
    console.log(error);
    if (error.code = "ECONNREFUSED") {
        console.log("Connection refused, is QLab open? Retrying in 2 seconds.");
        connected = false;
        clearMainButtons();
        setButtonColor(8, 9, 0, false);
    }
});

client.on("close", function(error) {
    console.log("Connection closed. Retrying in 2 seconds.");
    client.socket.removeAllListeners();
    connected = false;
    clearMainButtons();
    setButtonColor(8, 9, 0, false);
});

setInterval(() => {
    if (!connected) {
        client.open();
        connected = true;
    }
}, 2000);

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

http.createServer(function (request, response) {
    var parsed = url.parse(request.url, true);

    if (parsed.query.delete != undefined) {
        var deleteStmt = db.prepare("DELETE FROM asplay_log WHERE id = ?", parsed.query.delete);
        deleteStmt.run();
        response.writeHead(200, {"Content-Type": "text/html"});
        response.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Launchpad QLab</title>
        </head>
        <body>
            <h2>Deleted</h2>
            <a href="/">Go back</a>
        </body>
        `);
        response.end();
        return;
    }
    var start_time = new Date();
    start_time.setHours(start_time.getHours() - 12);
    start_time.setSeconds(0);
    var end_time = new Date();
    end_time.setSeconds(60);
    var range = false;
    if (parsed.query.start_time == undefined && parsed.query.stop_time == undefined) {
        //Pass
    } else {
        range = true;
        start_time = new Date(parsed.query.start_time);
        end_time = new Date(parsed.query.end_time);
        end_time.setMilliseconds(999);
    }


    var playbackLog = [];
    var stmt = db.prepare("SELECT music_cut, start_time, stop_time, (stop_time - start_time) AS play_time, id FROM asplay_log WHERE start_time >= ? AND stop_time <= ? ORDER BY start_time ASC", start_time.getTime(), end_time.getTime());
    stmt.all(function (err, playbackResults) {
        for (var playbackResult of playbackResults) {
            playbackLog.push(`<tr><td>${playbackResult.music_cut}</td><td>${formatDate(new Date(playbackResult.start_time))}</td><td>${formatDate(new Date(playbackResult.stop_time))}</td><td>${(playbackResult.play_time / 1000).toFixed(1)}</td><td><a href="?delete=${playbackResult.id}">[X]</a></td></tr>`);
        }
        var totalLog = [];
        var stmt2 = db.prepare("SELECT music_cut, count(music_cut) AS play_count, SUM(stop_time - start_time) AS play_time FROM asplay_log WHERE start_time >= ? AND stop_time <= ? GROUP BY music_cut", start_time.getTime(), end_time.getTime());
        stmt2.all(function (err, totalResults) {
            for (var totalResult of totalResults) {
                totalLog.push(`<tr><td>${totalResult.music_cut}</td><td>${totalResult.play_count}</td><td>${(totalResult.play_time / 1000).toFixed(1)}</td></tr>`);
            }
            var filter = "Showing last 12 hours";
            if (range) {
                filter = `Filtered from ${formatDate(start_time)} to ${formatDate(end_time)}<br><a href="/">Clear filter</a>`;
            }
            response.writeHead(200, {"Content-Type": "text/html"});
            response.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Launchpad QLab</title>
                <style>
                    table, th, td {
                        border: 1px solid black;
                        padding: 5px;
                    }
                </style>
            </head>
            <body>
                <h1>Launchpad QLab</h1>
                <form>
                    <label><small>YYYY-MM-DD HH:MM:SS (24hr clock)</small></label><br>
                    <label for="start_time">Start time:</label>
                    <input id="start_time" type="text" name="start_time" value="${formatDate(start_time)}" autocomplete="off">
                    <label for="end_time">End time:</label>
                    <input id="end_time" type="text" name="end_time" value="${formatDate(end_time)}" autocomplete="off">
                    <input type="submit" value="Filter"><br>
                </form>
                <br>
                ${filter}
                <h2>Log</h2>
                <table>
                    <tr><th>Cut Name</th><th>Start Time</th><th>Stop Time</th><th>Play Time</th><th>Delete</th></tr>
                    ${playbackLog.join("")}
                </table>
                <h2>Totals</h2>
                <table>
                    <tr><th>Cut Name</th><th>Total Plays</th><th>Total Time</th></tr>
                    ${totalLog.join("")}
                </table>
            </body>
            </html>
            `);
            response.end();
        });
        stmt2.finalize();
    });
    stmt.finalize();
}).listen(8080);

process.on("SIGINT", function() {
    clearMainButtons();
    setButtonColor(8, 9, 0, false);
    db.close();
    process.exit(0);
});