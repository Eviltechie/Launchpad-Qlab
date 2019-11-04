## Welcome
This program is a bridge between QLab and a Novation Launchpad Mini MK3. I wrote this to assist in playing back music for broadcast television, but it may be useful for other applications.

This program is designed to work with the cart wall in QLab. It will cause the buttons on the Launchpad to light up corresponding to the position and color of each cart in QLab. It also features playback logging, both play count and total time played.

While this was written for the Mini MK3, I suspect it will work with the Launchpad X as well. It's also possible that it may work with older Launchpads, but you may have to tweak the MIDI code.

## Installation
1. Make a folder and download `Launchpad-Qlab.js`.
2. Install node.js.
3. Install Python 2. (Yes, I know it's old, but node-gyp uses it in the build process. Hopefully down the road it won't and Python 3 can be used instead.)
4. In terminal, navigate to the folder you downloaded `Launchpad-Qlab.js` and run `npm install serialport` to install the `serialport` library. (While this program doesn't directly use serialport, this compiles some native code that `midi` and `osc` rely on, and which I found to not compile correctly if installed directly. (Note: You may be prompted to install some XCode Command Line Tools at this time. This is required to install `serialport`, `midi`, and `osc`.
5. Now run `npm install midi` and `npm install osc` to install `midi` and `osc`.

At this point you should have everything you need to run this program. (Fun fact: This will run on Windows too, which is where I wrote this. Obviously that's not super useful, but it does work.)

## Configuration
If you edit `Launchpad-QLab.js`, you should see two lines near the top for configuration.
```
//CONFIG
var midiPort = 2;
var host = "localhost";
//END CONFIG
```
`midiPort` is the MIDI port that the Launchpad is attached to. When you run the program it will list connected MIDI devices. You are looking for the port where `Launchpad Mini MK3 LPMiniMK3 MIDI In` is listed. (This will be different if you're not on a Mac for some reason.)

`host` is the IP address of the computer running QLab. In most cases, this should be `localhost`.

## How To Use
This program is designed to work with the cart wall in QLab. It will cause the buttons on the Launchpad to light up corresponding to the position and color of each cart in QLab. It also features playback logging, both play count and total time played.

1. Setup the cart wall to your liking. You can use any grid size you want, up to 8x8. (It's worth taking a look at my suggested default settings below before you start though.)
2. Setup a MIDI trigger on each cart that corresponds to the same position button on the Launchpad. You'll want to stick to the standard 8x8 grid of buttons, ignoring the labeled buttons in the top and right rows. (You can do this step later if you want. It's probably faster once everything is lit up anyway.)
3. In the workspace settings, setup the bottom right button to `Panic All` This is the button labeled `Stop/Solo/Mute` on the Mini. (This button will light up red, for stop.)
4. Put the Launchpad in programmer mode. (Hold `Session` for a second or so, then press the orange button the bottom right corner. Then press `Session` again to exit. You can also set the LED brightness here to your liking as well. See the Launchpad manual for more info.)
5. Start the program with `node Launchpad-QLab.js`. Hopefully you should see the Launchpad light up its buttons that correspond to the arrangement of your cart wall.

Hitting a button should start your cart, and the button should blink while it's playing. You will also see logging information be printed to the terminal.

To exit, do `Ctrl + C` on your keyboard. The log will be totaled and printed to the terminal, as well as written to a file.

**Important Note** This program will not know if you move, change, or rename a cart after you start it. If you need to make changes to your cart wall, restart the program after doing so. (And don't forget to update your MIDI triggers as well.)

### Playing Out Multiple Cuts Simultaneously (For Commercial and Sanitized Playback)
If you are in a situation where you need to playback two cuts of music simultaneously (for a commercial and sanitized mix), you're covered. Here is the easiest way I've found:

1. Setup your routing so that by default carts will come out both outputs. Then set additional outputs to map to individual outputs. (Routing table below.)
2. Add a cue list for your commercial/sanitized cuts.
3. Add a group cue, set the mode to timeline. Take note of the cue number.
4. Add your two cuts to this cue. Change the routing for each cut appropriately, and remember to uncheck the "Fade & Stop all" if you have that set.
5. Then, add a "Start" cue in your cart wall to trigger the. Set the target to the cue ID of the group cue. (Note that Start cues will not blink like Music cues.)

|          |   |   |   |   |
|----------|---|---|---|---|
|  Both L  | 0 |   | 0 |   |
|  Both R  |   | 0 |   | 0 |
| First L  | 0 |   |   |   |
| First R  |   | 0 |   |   |
| Second L |   |   | 0 |   |
| Second R |   |   |   | 0 |

### Suggested QLab Default Cart Settings
Here are some default settings to help you get started.

**Music Cues**

 - Check Fade & Stop all over time: 00:01.0 (This will get you a 1 second crossfade between cuts.)
 - Check MIDI Trigger (So you just have to hit capture when you set or change the trigger later.)

**Group Cues**
 - Check Fade & Stop all over time: 00:01.0

## A Note On Reliability
Since this program does not send any commands to QLab and since QLab listens to MIDI directly from the Launchpad there should be no risk to your show if this program crashes. The lights on the Launchpad will no longer update, and logging will not work, but the Launchpad buttons will continue to trigger cuts.

## Questions, Comments?
File an issue, or come find me on the video engineering discord.
