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

Most of their length goes on process rather than subject. They're written for a
model that can already dispatch four to six subagents, write and test its own
code, and go find the facts it needs, so what they add is discipline rather
than knowledge.

Nearly all of that discipline is one idea. **What's in the context window when
the work happens decides the work.**

Give the judge an empty one. `financial-planning` red-teams its finished plan
with a subagent that didn't write it, on the grounds that "the author of a
model has already rationalized its weakest assumptions, and by this stage you
are the author." The auditor's prompt ends "Return findings only, no praise
section."

Refill it at the moment of use. Reference files stay unread until the stage
that needs them, because "a requirement shapes an artifact only if it is in
context when the artifact is written, and by the later stages an up-front skim
is dozens of tool calls in the past."

Prime several differently. `life-paths` drafts career paths with parallel
agents under different lenses, on the theory that "an agent told to find 'the
best independent path' is unlikely to converge with an agent told to find 'the
best institutional path'."

One rule sits outside all that: the safe answer is the failure. `life-paths`
ends on a bet and what would change it, since "balanced non-answers waste the
person's time." `financial-planning` won't lead with a survival percentage,
which under adaptive spending comes out "true by construction because the model
cuts spending instead of depleting." It leads with the spending floor you'd
actually live on.

They also know where to stop. `life-paths` asks you to look hard at your own
record, and sometimes what surfaces isn't a planning problem. Its instruction
then is to "stop being a process and be present; planning resumes later or not
at all, at their pace." When the news is bad, deliver it "plainly and without
cushioning it into vagueness," next to what the record does support. Honest and
kind are compatible, it says, and the skill requires both.

Does any of it show up in practice? On one audit eval the run with the skill
made 84 tool calls over 25 minutes and left a plan, an assumptions register, a
facts register, and historical return series it went and fetched. Without it:
10 calls, six minutes, no files, and about the same 10,500 characters of prose.
The eval suite around that turned out noisier than the effects it was
measuring, which is a post of its own.

```
/plugin marketplace add https://github.com/matt-w-horn/skills.git
/plugin install skills@matt-horn-skills
```

A new session picks them up; `/reload-plugins` in one already running. Your
numbers go to a model like anything else you type, though the simulators are
standard-library Python and stay on your machine.

If a skill fires when it shouldn't, that's the interesting bug. Send me the
query.
