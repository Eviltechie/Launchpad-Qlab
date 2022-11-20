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
client.on("ready", function () {
    sendOSCAddress("/workspaces"); //List all workspaces. We will connect to the first one and ignore the rest.
});

var workspaceID;

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
    }
}

//Request list of workspaces in order to attempt to connect to one in onWorkspaces
function refreshWorkspaces() {
    sendOSCAddress("/workspaces");
}

//Handle incoming OSC messages
client.on("message", function (oscMsg, timeTag, info) {
    console.log("=====> ", oscMsg);

    address = oscMsg.address;

    switch (address) {
        case "/reply/workspaces":
            onWorkspaces(oscMsg.args);
            break;
        case "/update/workspace/" + workspaceID + "/disconnect":
            console.log("Workspace shutting down");
            refreshWorkspaces();
            break;
    }
});