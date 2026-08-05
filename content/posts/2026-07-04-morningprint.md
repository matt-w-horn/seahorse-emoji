+++
title = "My receipt printer prints an original artwork every morning"
date = 2026-07-04
author = "Matt Horn"
+++

A thermal printer in my kitchen prints one original piece of CP437 block art every morning. It works from ordinary inputs: the date, the weather, whatever is happening today. What comes back is one committed composition in a character set from 1981, printed once, with no drivers and no image files anywhere in the pipeline.

Here's what came out of the printer yesterday and this morning:

<p align="center">
  <img src="https://raw.githubusercontent.com/matt-w-horn/morningprint/main/example/example_2.jpeg" width="700" alt="Two thermal receipts pinned side by side on a corkboard. Left, dated Friday July 3 2026: a lone firework rocket climbs a dotted trail through a sparse starfield above a solid-black skyline. Right, dated Saturday July 4 2026: the same skyline under a sky full of firework bursts.">
</p>

On the 3rd it printed a lone scout rocket over a dark skyline, with a verse ending "Tomorrow, the whole sky." This morning it printed the same skyline under a full fireworks display. No cron entry said fireworks on the 4th. The callback is an affordance I built, though, and the 4th is the easiest day in the year to see coming.

## The setup

- An Epson TM-T20III, the 80mm thermal printer restaurants use for kitchen orders
- A Raspberry Pi Zero W running a ~40-line Python `http.server` that pipes whatever bytes it receives into `/dev/usb/lp0`
- An ngrok tunnel with basic auth in front of the Pi
- A Google Apps Script on a daily trigger, doing everything else

The printer and Pi were left over from a calendar printer and an AI morning briefing, both of which I deleted. The daily art job is the one that stuck.

## How a language model draws on a receipt

Every morning the script builds a small brief: the date, the season, the current weather, and one-line notes on the last fourteen pieces it printed. That goes to the model with a system prompt describing the medium: a monospace grid 48 columns wide in the default font, one-bit black, and only the characters in CP437, the IBM PC character set from 1981. It can run a couple of web searches for what is happening today, and it has to come back with one committed idea.

It doesn't emit printer bytes. It returns a spec, forced through structured output so it can't return anything else:

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

A renderer of about fifty lines turns the ops into raw ESC/POS commands; the art is text with style attributes all the way down. CP437 turns out to have almost everything block art needs: `░ ▒ ▓ █` make gradients, half-blocks make silhouettes, inverted text makes solid black fields, and the printer scales type up to 8× in either direction.

The one thing that needed real calibration: by default the printer leaves a thin white seam between text lines, which ruins block art. ESC/POS lets you set the line spacing directly, and there's a value where rows of `█` fuse into a continuous field. I found it with a test page; the full byte-level protocol is written up in the repo docs.

One more detail: the renderer treats the model's spec as untrusted input. Control characters are stripped so they can't turn into printer commands, rows are truncated to the column budget, scale factors are clamped, and the whole job is capped at 150 rows. That all runs in Apps Script, upstream of the Pi, so it bounds what my own prompt can produce and nothing else. The tunnel is the real exposure: anyone past the basic auth is talking straight to `/dev/usb/lp0`. I left it there because the worst case behind it is a wasted roll of paper.

## Keeping it from printing the same sunset every day

The failure mode of a daily generative loop is convergence. Left alone, it settles on a nice sunset and prints that every morning. So every piece's title and a one-line style note go into a rolling fourteen-day history, and the prompt asks each new piece to differ sharply from everything in it. Nothing verifies that it did: the only thing resisting convergence is the model reading its own last fourteen entries, and the window means day fifteen can repeat day one. That pressure alone still produces a surprising range: landscapes, geometric abstraction, giant-type posters, constellation maps, diagrams.

There's one deliberate exception. On a day that earns it (a holiday after its eve, an event still unfolding) the model may answer an earlier piece instead, and the link goes into the history. Those links show up as markers in the brief it reads on later days. There are no dice rolls or cooldowns in code, and nothing rate-limits the callbacks either: the marker is text in the next day's brief, and the only thing stopping a run of them is that the model has usually preferred to move on. That's where the fireworks came from. On the 3rd it printed the eve; this morning it answered it.

## Why the flag is set last

Apps Script turned out to be the right amount of infrastructure: no server, free scheduling, and the only thing I maintain is the Pi. The retry logic is free: the "already printed today" flag is only set after a successful print, so an hourly trigger doubles as a retry loop on bad mornings. A rate-limited email tells me when something is actually broken.

The source is TypeScript, bundled with esbuild into one file because Apps Script has no module system. A local harness POSTs test prints straight to the Pi, so I can iterate on the renderer without redeploying anything.

## Run your own

Everything is MIT-licensed at [matt-w-horn/morningprint](https://github.com/matt-w-horn/morningprint). Any ESC/POS printer with a CP437 code page should work; the repo has the full protocol spec, the Pi setup, and a calibration page for dialing in other printers. If you build one, tell me what yours prints.
