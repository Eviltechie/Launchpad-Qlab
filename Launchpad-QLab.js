//CONFIG
var midiPort = 1;
var host = "127.0.0.1";
//END CONFIG

var osc = require("osc");
var midi = require('midi');

//MIDI SETUP
var launchpad = new midi.Output();

//List MIDI ports
console.log("MIDI PORTS:");
for (var x = 0; x < launchpad.getPortCount(); x++) {
    console.log("Port " + x + ": " + launchpad.getPortName(x));
}

console.log("\nOpening MIDI port " + midiPort + "\n");
launchpad.openPort(midiPort);

launchpad.sendMessage([240, 0, 32, 41, 2, 13, 14, 1, 247]); //Set launchpad to programmers mode

//Turn off all buttons.
for (x = 0; x < 10; x++) {
    for (y = 0; y < 10; y++) {
        setButtonColor(x, y, 0);
    }
}

//Set stop button as red (8,9 instead of 9,9 because we ignore the top row)
setButtonColor(8, 9, parseColor("red"));
//END MIDI SETUP

//Interpert QLab color to Launchpad color
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
        launchpad.sendMessage([145, x + y, color]);
    } else {
        launchpad.sendMessage([144, x + y, color]);
    }
}

function clearMainButtons() {
    for (x = 0; x <= 8; x++) {
        for (y = 0; y <= 8; y++) {
            setButtonColor(x, y, 0);
        }
    }
}

function setButtonColorFromCueID(id) {
    cue = getCue(id);
    position = cuePositions.get(id);

    setButtonColor(position[0], position[1], parseColor(cue.colorName), false);
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
    }
}

//Request list of workspaces in order to attempt to connect to one in onWorkspaces
function refreshWorkspaces() {
    sendOSCAddress("/workspaces");
}

//Handle incoming cue list, querying cart cues for their position in the wall
function onCueLists(args) {
    console.log("Received cue list");
    args = JSON.parse(args[0]);
    cueList = args.data;
    //console.log(JSON.stringify(cueList));


    for (group of cueList) {
        if (group.type == "Cart") {
            for (cue of group.cues) {
                sendOSCAddress("/cue_id/" + cue.uniqueID + "/cartPosition");
                numFirstCartCues++;
            }
            console.log("Expecting " + numFirstCartCues + " cart cues");
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

//Adds position data to both the map
function addPositionToCue(id, args) {
    args = JSON.parse(args);
    cuePositions.set(id, args.data);
    if (cuePositions.size == numFirstCartCues) {
        console.log("All positions received, setting colors");
        clearMainButtons();
        for (var [key, value] of cuePositions) {
            setButtonColorFromCueID(key);
        }
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
    }

    var cuePositionMatcher = new RegExp("\/reply\/cue_id\/(.*)\/cartPosition", "g");
    if (cuePositionMatcher.test(address)) {
        cuePositionMatcher.lastIndex = 0;
        var cueID = cuePositionMatcher.exec(address)[1];
        console.log("Received cartPosition for cue " + cueID);
        addPositionToCue(cueID, oscMsg.args);
        return;
    }

    var cueUpdateMatcher = new RegExp("\/update\/workspace\/" + workspaceID + "\/cue_id\/(.*)", "g");
    if (cueUpdateMatcher.test(address)) {
        cueUpdateMatcher.lastIndex = 0;
        var cueID = cueUpdateMatcher.exec(address)[1];
        console.log("Cue " + cueID + " updated");
        if (cueID == "[root group of cue lists]") {
            return;
        }
        cue = getCue(cueID);
        console.log("Something changed, reloading cue lists");
        sendOSCAddress("/workspace/" + workspaceID + "/cueLists");
        numFirstCartCues = 0;
        cuePositions.clear();
        return;
    }

    console.log(Date.now() + " " + oscMsg.address);
    //console.log("=====> ", oscMsg);
});