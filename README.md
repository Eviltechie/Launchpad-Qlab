## Welcome
This program is a bridge between QLab and a Novation Launchpad Mini MK3. I wrote this to assist in playing back music for broadcast television, but it may be useful for other applications.

This program is designed to work with the cart wall in QLab. It will cause the buttons on the Launchpad to light up corresponding to the position and color of each cart in QLab. It will listen for MIDI from the Launchpad and use that to trigger your carts, saving you from having to map each button manually. It also features playback logging, allowing you to view a report of the playback log, as well as summing total play count and time.

This was written for the Launchpad Mini MK3. It may be able to support other Launchpads with tweaks to the MIDI code.

## Installation
This is written with node.js v19.1.0, Mac OS Ventura 13.0.1 (Intel), and QLab 5.0.10.

I suggest using `brew` to install `git` and `node`, but it shouldn't be strictly required.

1. Download this code and place it into a folder. If you are using `git`, then you can run `git clone git@github.com:Eviltechie/Launchpad-Qlab.git` do this in one step.
1. Install node.js.
1. Inside the folder, run `npm install` to download the dependencies. (MIDI, OSC, sqlite3)

You should now be good to go. Proceed to the configuration section below.

## Configuration
If you edit `Launchpad-QLab.js`, you should see the following lines near the top for configuration.
```
//CONFIG
var midiOutputPort = 1;
var midiInputPort = 1;
var host = "127.0.0.1";
//END CONFIG
```
`midiOutputPort` and `midiInputPort` are the MIDI ports that Launchpad will attach to. When you run this program it will list connected MIDI devices. If you are on Mac OS, look for `Launchpad Mini MK3 LPMiniMK3 MIDI In` and `Launchpad Mini MK3 LPMiniMK3 MIDI Out`.

`host` is the IP address of the computer running QLab. In most cases, this should be `127.0.0.1`. (If you set this to `localhost` instead, node will probably bind to IPv6 and things probably won't work at all.)

If you have any difficulty, you may want to create a workspace with the settings below and have that open.

## Basic Use
This program is designed to work with the cart wall in QLab. It will cause the buttons on the Launchpad to light up corresponding to the position and color of each cart in QLab. It will listen for MIDI from the Launchpad and use that to trigger your carts, saving you from having to map each button manually. It also features playback logging, allowing you to view a report of the playback log, as well as summing total play count and time.

1. Create a new workspace.
1. Go to `File > Workspace Settings > Network > OSC Access` and make sure that `View`, `Edit`, and `Control` are enabled for `No Passcode`.
1. Add a cart wall to the workspace with the `New Cart` button. Any grid size up to 8x8 is supported. You may delete the default cue list if you like. (Take a look further on for suggested default cue settings that you may want to use.)
1. Add carts, setting the position, name, and color of each to your liking. Note: The name of the cart as it is displayed is what will be logged.
1. Start the program with `node Launchpad-QLab.js`. The Launchpad should automatically put itself in programmer mode, and you should see it light up buttons corresponding to your cart wall layout.
1. Press any button to start your cue. The button should blink while the cue is playing.
1. The button labeled `Stop/Solo/Mute` will send a `panic all` command to the workspace, fading out all cues.

Note: This program will connect to the first workspace that it finds, and it will display the carts from the first cart wall within that workspace. Cues from other lists or cart walls within that workspace will be logged (with the exception of start cues and group cues themselves). Cues from other workspaces will be ignored.

If you close the workspace that this program is using, it will simply connect to the next one, waiting if necessary.

To exit the program, hit `Ctrl + C`.

## Viewing, Editing, and Exporting the Log

Instead of writing the log to a text file on close, this program now logs everything to a sqlite database, `asplay.db`. This allows for continuous logging reducing the chance that something is missed. It also means that the program can be kept running for long periods of time, and log files can be generated as needed. It also allows for individual log entries to be deleted, in case of a mis triggering.

To access the log, open a browser and navigate to your IP address on port 8080. (e.g. http://127.0.0.1:8080) You should see the playback log, as well as totals from the last 12 hours. You can customize the date range by entering a start time and end time, and pressing filter. (Tip: The start and end times listed in the table are the same format that you should enter to filter. Find your opening and closing music cuts and just copy and paste!)

To delete an individual log entry, click the `[X]` next to the corresponding item in the log.

Once you are have filtered down to the log entries you want to see, you can export by printing to a PDF, or by copying the tables into a spreadsheet program.

Should the log need to be totally cleared, stop the program and delete `asplay.db`. A new blank database will be created on next startup.

## Notable Changes from the Previous Version

Unlike before, don't map the MIDI triggers of individual cues (or panic all) to the buttons on the Launchpad. This program will listen for the MIDI and trigger QLab over OSC. This should alleviate the AD asking for "one more cut" of music in the middle of the show, screwing up logging, or worse, crashing and stopping the log.

It is now safe to edit the workspace while this program is running. You can add, edit, or delete cues and you will see your changes reflected instantly.

## Suggested QLab Default Cart Settings
Here are some default settings to help you get started.

**Music Cues**

 - Check Fade & Stop all over time: 00:01.0 (This will get you a 1 second crossfade between cuts.)

**Group Cues**
 - Check Fade & Stop all over time: 00:01.0

## Playing Out Multiple Cuts Simultaneously (For Commercial and Sanitized Playback)
If you are in a situation where you need to playback two cuts of music simultaneously (for a commercial and sanitized mix like ESPN requires), you're covered.

This will require an audio output device with at least four channels and the QLab audio license.

1. In your workspace audio settings, edit the patch for your output device. Find the "Patch Routing" tab.
1. Map input 1 to crosspoints 1 and 3. Map input 2 to crosspoints 2 and 4. (This covers the default case of generic cuts that will play on both the commercial and sanitized mixes.)
1. Map input 3 to crosspoint 1. Map input 4 to crosspoint 2. (This is for commercial tracks, which will only play out of channels 1+2.)
1. Map input 5 to crosspoint 3. Map input 6 to crosspoint 4. (This is for the generic cut that will be played on 3+4 when you are playing a commercial cut.)
1. Add generic/theme cuts to your cart wall as normal. These will map to "input" 1 and 2 like normal, and due to the above routing, will simulatenoiusly play out both stereo pairs.
1. Add a group cue to a normal cue list, and take note of the cue number.
1. Add both your commercial and sanitized cuts to that group.
1. Change the routing of the commercial cut from 1+2 to 3+4. This will change it to only come out the first stereo pair.
1. Change the routing of the generic cut from 1+2 to 5+6. This will change it to only come out of the second stereo pair.
1. Make sure both your commercial and generic cuts aren't set to "Fade & Stop All". Set that on the group instead.
1. On your main cart wall, add a "Start" cue, and have it reference the cue number of your group. (Note that start cues are instant, so they will not blink.)

**Table showing the audio routing**

|          |   |   |   |   |
|----------|---|---|---|---|
|  Both L  | 0 |   | 0 |   |
|  Both R  |   | 0 |   | 0 |
| First L  | 0 |   |   |   |
| First R  |   | 0 |   |   |
| Second L |   |   | 0 |   |
| Second R |   |   |   | 0 |

## Questions, Comments?
File an issue, or come find me on the video engineering discord.
