### My receipt printer prints an original artwork every morning

*Matt Horn ([About](./README.md))*

*published July 4, 2026*

*Written in a personal capacity. Views are my own, not those of any employer.*

The first minutes of my day were going to my phone. I'd wake up, scroll the news, check the weather, and feel slightly worse for it. So I made a bet with myself: could the same inputs (weather, headlines, whatever today's date means) arrive on paper instead, once a day, with nothing to refresh?

Here's what came out of the printer yesterday and this morning:

<p align="center">
  <img src="https://raw.githubusercontent.com/matt-w-horn/morningprint/main/example/example_2.jpeg" width="700" alt="Two thermal receipts pinned side by side on a corkboard. Left, dated Friday July 3 2026: a lone firework rocket climbs a dotted trail through a sparse starfield above a solid-black skyline. Right, dated Saturday July 4 2026: the same skyline under a sky full of firework bursts.">
</p>

On the 3rd it printed a lone scout rocket over a dark skyline, with a verse ending "Tomorrow, the whole sky." This morning it printed the same skyline under a full fireworks display. Nobody planned the sequel. I'll get to how that works.

## The setup

- An Epson TM-T20III, the 80mm thermal printer restaurants use for kitchen orders
- A Raspberry Pi Zero W running a ~40-line Python `http.server` that pipes whatever bytes it receives into `/dev/usb/lp0`
- An ngrok tunnel with basic auth in front of the Pi
- A Google Apps Script on a daily trigger, doing everything else

The printer and the Pi were already on my network from earlier experiments. I had used them to print my calendar for the day, and later an AI-generated morning briefing. Both went dormant and I eventually deleted them. The daily art job is the one that stuck.

## How a language model draws on a receipt

Every morning the script builds a small brief: the date, the season, the current weather, and one-line notes on the last fourteen pieces it printed. That goes to Claude with a system prompt describing the medium: a 48-column monospace grid, one-bit black, and only the characters in CP437, the IBM PC character set from 1981. It can run a couple of web searches to feel out the day, and it has to come back with one committed idea.

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

A renderer of about fifty lines turns the ops into raw ESC/POS commands. No drivers, no image files anywhere in the pipeline; the art is literally text with style attributes. CP437 is a better art medium than it has any right to be: `░ ▒ ▓ █` make gradients, half-blocks make silhouettes, inverted text makes solid black fields, and the printer scales type up to 8× in either direction.

The one thing that needed real calibration: by default the printer leaves a thin white seam between text lines, which ruins block art. ESC/POS lets you set the line spacing directly, and there's a value where rows of `█` fuse into a continuous field. I found it with a test page, and ended up writing the whole byte-level protocol into the repo docs while I was at it.

One more detail, because I do security for a living: the renderer treats the model's spec as untrusted input. Sizes are clamped, rows are truncated to the column budget, control characters are stripped so they can't turn into printer commands, and output is capped at 150 rows, about 45 cm of paper. I wasn't going to let a language model send unfiltered bytes at hardware, even a receipt printer.

## Keeping it from printing the same sunset every day

The failure mode of a daily generative loop is convergence. Left alone, it will happily print a nice sunset every morning forever. So every piece's title and a one-line style note go into a rolling fourteen-day history, and the prompt requires each new piece to differ sharply from everything in it. That pressure alone produces a surprising range: landscapes, geometric abstraction, giant-type posters, constellation maps, diagrams.

There's one deliberate exception. On a day that earns it (a holiday after its eve, an event still unfolding) the model may answer an earlier piece instead, and it records the link. Those links show up as markers in the history it reads on later days, and a fresh marker raises the bar for the next one. There are no dice rolls or cooldowns in code; the model sees its own record and judges. That's where the fireworks came from. On the 3rd it printed the eve; this morning it decided the Fourth had earned a sequel and answered it.

## The boring reliability parts

Apps Script turned out to be the right amount of infrastructure: no server, free scheduling, and the only thing I maintain is the Pi. My favorite small trick is the retry logic: the "already printed today" flag is only set after a successful print, so an hourly trigger doubles as a retry loop on bad mornings, and a rate-limited alert email tells me if something is actually broken.

The source is TypeScript, bundled with esbuild into one file because Apps Script has no module system. A local harness POSTs test prints straight to the Pi, so I can iterate on the renderer without redeploying anything.

## Run your own

Everything is MIT-licensed at [matt-w-horn/morningprint](https://github.com/matt-w-horn/morningprint). Any ESC/POS printer with a CP437 code page should work; the repo has the full protocol spec, the Pi setup, and a calibration page for dialing in other printers. If you build one, I'd genuinely like to see what your printer decides your mornings look like.
