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
    sendOSCInteger("/updates", 1); //Subscribe to updates
    sendOSCAddress("/workspaces"); //List all workspaces. We will connect to the first one and ignore the rest.
});

var workspaceID;

function onWorkspaces(args) {
    args = JSON.parse(args[0]);
    console.log("Using workspace " + args.data[0].displayName + " with ID " + args.data[0].uniqueID);
    workspaceID = args.data[0].uniqueID
}

//Handle incoming OSC messages
client.on("message", function (oscMsg, timeTag, info) {
    console.log("=====> ", oscMsg);

    address = oscMsg.address;

    switch (address) {
        case "/reply/workspaces":
            onWorkspaces(oscMsg.args);
            break;
    }
});