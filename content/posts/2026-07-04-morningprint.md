+++
title = "My receipt printer prints an original artwork every morning"
date = 2026-07-04
author = "Matt Horn"
+++

A thermal printer in my kitchen prints one original piece of block art every morning, drawn in CP437, the IBM PC character set from 1981. A language model composes each piece from ordinary inputs: the date, the weather, whatever's happening today. It commits to one composition, and the printer prints it once. There are no drivers and no image files anywhere in the pipeline.

Here's what came out of the printer yesterday and this morning:

<p align="center">
  <img src="https://raw.githubusercontent.com/matt-w-horn/morningprint/main/example/example_2.jpeg" width="700" alt="Two thermal receipts pinned side by side on a corkboard. Left, dated Friday July 3 2026: a lone firework rocket climbs a dotted trail through a sparse starfield above a solid-black skyline. Right, dated Saturday July 4 2026: the same skyline under a sky full of firework bursts.">
</p>

On the 3rd it printed a lone scout rocket over a dark skyline, with a verse ending "Tomorrow, the whole sky." This morning it printed the same skyline under a full fireworks display. I didn't schedule fireworks for the 4th. I did build the callback, though: the model is allowed to answer a piece it printed earlier, and the 4th is the easiest day in the year to see coming.

If you'd like one of your own, you need a receipt printer and a Raspberry Pi, and the source is open.

## The setup

- An Epson TM-T20III, the 80mm thermal printer restaurants use for kitchen orders
- A Raspberry Pi Zero W running a ~40-line Python `http.server` that pipes whatever bytes it receives into `/dev/usb/lp0`
- An ngrok tunnel with basic auth in front of the Pi
- A Google Apps Script on a daily trigger, doing everything else

Apps Script is Google's hosted JavaScript platform, which can run a function on a schedule. It runs on Google's servers, so the script needs a public address to reach the Pi, and ngrok is a service that gives a machine on a private network one.

I had the printer and the Pi left over from a calendar printer and an AI morning briefing, both of which I deleted. The daily art job is the one I kept.

## How a language model draws on a receipt

Every morning the script builds a small brief: the date, the season, the current weather, and one-line notes on the last fourteen pieces it printed. It sends the brief to the model with a system prompt that describes the medium: a monospace grid 48 columns wide in the default font, one-bit black, and only the characters in CP437. The model can run a couple of web searches for what's happening today, and it has to come back with one committed idea.

The model returns a spec. I use structured output, the API feature that holds a model's reply to a JSON schema, so it can't return anything else:

```json
{
  "verse": "The mountains hold their breath;\nthe sun tries every shade of gray\nbefore committing to gold.",
  "ops": [
    { "text": "░░░░\n▒▒▒▒\n▓▓▓▓", "gapless": true },
    { "text": " DAWN ", "width": 2, "height": 2, "bold": true, "invert": true },
    { "text": "every feature · one receipt", "font": "B", "align": "right" }
  ]
}
```

A renderer of about fifty lines turns the ops into raw commands in ESC/POS, Epson's protocol for receipt printers. The art is text with style attributes at every layer. CP437 has almost everything block art needs: `░ ▒ ▓ █` make gradients, half-blocks make silhouettes, inverted text makes solid black fields, and the printer scales type up to 8× in either direction.

I had to calibrate one thing. By default the printer leaves a thin white seam between text lines, which ruins block art. ESC/POS lets you set the line spacing directly, and at one value the rows of `█` fuse into a continuous field. I found that value with a test page, and I wrote up the full byte-level protocol in the repo docs.

The renderer treats the model's spec as untrusted input. It strips control characters so they can't turn into printer commands: in ESC/POS, commands share one byte stream with the text, and each command starts with a control character. It truncates rows to the column budget, clamps scale factors, and caps the whole job at 150 rows. All of that runs in Apps Script, upstream of the Pi, so it bounds what my own prompt can produce and nothing else. The tunnel is exposed, though: anyone who gets past the basic auth is talking straight to the printer at `/dev/usb/lp0`. I left it there because the worst case behind it is a wasted roll of paper.

## Keeping it from printing the same sunset every day

A daily generative loop tends to converge. Left alone, it settles on a nice sunset and prints that every morning. So the script keeps every piece's title and a one-line style note in a rolling fourteen-day history, and the prompt asks for a new piece that differs sharply from everything in it. Nothing verifies that it did. I rely on the model reading its own last fourteen entries, and because the history is a window, day fifteen can repeat day one. Even so, the range surprises me: landscapes, geometric abstraction, giant-type posters, constellation maps, diagrams.

I made one exception on purpose. When the day gives it a reason (a holiday after its eve, an event still unfolding), the model may answer an earlier piece instead, and the script records the link in the history. The model sees those links as markers in the brief on later days. I wrote no dice rolls or cooldowns, and nothing rate-limits the callbacks either: the marker is text in the next day's brief, and the model decides whether to answer again. It has usually preferred to move on. That is how I got the fireworks: on the 3rd it printed the eve, and this morning it answered it.

## Why the flag is set last

Apps Script is the right amount of infrastructure for this: there is no server, scheduling is free, and the only thing I maintain is the Pi. I got retries for free as well. The script sets the "already printed today" flag only after a successful print, so a failed run leaves it unset and an hourly trigger will retry on bad mornings. I get a rate-limited email when something is actually broken.

I wrote the source in TypeScript and bundle it with esbuild (a JavaScript bundler) into one file, because Apps Script has no module system. A local harness POSTs test prints straight to the Pi, so I can iterate on the renderer without redeploying anything.

## Run your own

Everything is MIT-licensed at [matt-w-horn/morningprint](https://github.com/matt-w-horn/morningprint). Any ESC/POS printer with a CP437 code page should work; the repo has the full protocol spec, the Pi setup, and a calibration page for dialing in other printers. If you build one, tell me what yours prints.
