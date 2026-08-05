+++
title = "Three skills for the home office"
date = 2026-08-06
author = "Matt Horn"
+++

Three skills for the questions I'd rather work through at my own desk than ask
out loud: whether my record supports what I want to do next, whether the money
is there yet, and whether the thing I just wrote is any good. They live in
[matt-w-horn/skills](https://github.com/matt-w-horn/skills), separate from the
[Lean ones](/posts/2026-08-01-honesty-gates/).

| Skill | What it does |
|---|---|
| `life-paths` | Maps long-term life and career paths from a person's record and finances. |
| `financial-planning` | Builds and stress-tests a saving schedule, retirement timing, and drawdown. |
| `writing-axes` | Routes a writing task through reader, goal, and axis before drafting, then applies that axis's rules. |

They're written for a model that can already dispatch subagents, write and test
its own code, and go find the facts it needs, so what they add is discipline
rather than knowledge. Nearly all of it is one idea: **what's in the context
window when the work happens decides the work.**

The judge gets an empty one. `financial-planning` red-teams its own plan with a
subagent that didn't write it, since "the author of a model has already
rationalized its weakest assumptions, and by this stage you are the author."
Reference files stay unread until the stage that needs them. Career paths come
from parallel agents primed with different lenses, then get checked by hand for
whether they really differ.

One rule sits outside that: the safe answer is the failure. No survival
percentages, no balanced non-answers. `life-paths` ends on a bet and what would
change it.

Each also knows where to stop. `life-paths` asks you to look hard at your own
record, and sometimes what surfaces isn't a planning problem; the instruction
then is to "stop being a process and be present." Honest and kind are
compatible, it says, and the skill requires both.

Does it show up? On one audit eval the run with the skill made 84 tool calls
over 25 minutes and left four written artifacts behind. Without it: 10 calls,
six minutes, nothing on disk, and about the same volume of prose.

```
/plugin marketplace add https://github.com/matt-w-horn/skills.git
/plugin install skills@matt-horn-skills
```

A new session picks them up. Your numbers go to a model like anything else you
type.

If a skill fires when it shouldn't, that's the interesting bug. Send me the
query.
