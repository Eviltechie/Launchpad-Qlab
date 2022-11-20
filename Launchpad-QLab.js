//CONFIG
var midiPort = 1;
var host = "127.0.0.1";
//END CONFIG

var osc = require("osc");

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
var cueList;

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

    cueList.forEach(group => {
        console.log(group.type + ": " + group.listName);
        var isCart = false;
        if (group.type == "Cart") {
            isCart = true;
        }
        group.cues.forEach(cue => {
            console.log(cue.type + ": " + cue.listName);
            if (isCart) {
                //console.log("/cue/" + cue.uniqueID + "/cartPosition/");
                sendOSCAddress("/cue_id/" + cue.uniqueID + "/cartPosition");
            }
        });
    });
}

//Returns the cue (or group) for the provided ID
/*function getCue(id) {
    cueList.forEach(group => {
        if (group.uniqueID == id) {
            return group;
        }
        group.cues.forEach(cue => {
            if (cue.uniqueID == id) {
                console.log(cue);
                return cue;
            }
        });
    });

}*/

//Returns the cue (or group) for the provided ID
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

function addPositionToCue(id, args) {
    var cue = getCue(id);
    args = JSON.parse(args[0]);
    cue["position"] = args.data;
}

//Handle incoming OSC messages
client.on("message", function (oscMsg, timeTag, info) {
    console.log("=====> ", oscMsg);

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
    }

    var cuePositionMatcher = new RegExp("\/reply\/cue_id\/(.*)\/cartPosition", "g");
    if (cuePositionMatcher.test(address)) {
        cuePositionMatcher.lastIndex = 0;
        var cueID = cuePositionMatcher.exec(address)[1]
        console.log("Received cartPosition for cue " + cueID);
        addPositionToCue(cueID, oscMsg.args);
    }
});