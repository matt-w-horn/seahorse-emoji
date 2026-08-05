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
code, and go find the facts it needs. I haven't run them against a small model
to see what breaks first. The largest file in the repo is the exception that
proves the rule anyway: 913 lines teaching the model one subject, which is how
models like it get this exact job wrong.

The rest is one idea, cashed out three ways. **What's in the context window
when the work happens decides the work.**

Give the judge an empty one. `financial-planning` red-teams its finished plan
with a subagent that didn't write it. The reasoning: "the author of a model has
already rationalized its weakest assumptions, and by this stage you are the
author." `life-paths` runs a verifier for the same reason: the context that
just wrote a document "cannot feel its omissions." Both auditor prompts end the
same way — "Return findings only, no praise section."

Refill it at the moment of use. Both skills hold their reference files back
until the stage that needs them. `financial-planning` explains why: "a
requirement shapes an artifact only if it is in context when the artifact is
written, and by the later stages an up-front skim is dozens of tool calls in
the past." The big principles survive that distance. The checkable specifics
don't.

Prime several differently. `life-paths` drafts career paths with parallel
agents under different lenses, on the theory that "an agent told to find 'the
best independent path' is unlikely to converge with an agent told to find 'the
best institutional path'." Then it distrusts its own trick, calling the lenses
"scaffolding, not a guarantee," and makes you state each draft's bet in one
sentence to see whether they really differ.

One house rule sits outside all that: the safe answer is the failure.
`life-paths` ends on a bet and what would change it, because "balanced
non-answers waste the person's time." `writing-axes` says of an argument that a
document "that cannot be wrong has not said anything." `financial-planning`
won't lead with a survival percentage. Under adaptive spending those come out
"true by construction because the model cuts spending instead of depleting." So
it leads with the spending floor you'd actually live on.

They also know where to stop. `writing-axes` closes each rule file with a
section called *hand back to the writer*: how much risk to take on a claim,
what to disclose, all yours. `life-paths` puts it under care notes. It asks you
to look hard at your own record, and sometimes what surfaces isn't a planning
problem. Its instruction then is to "stop being a process and be present;
planning resumes later or not at all, at their pace." When the news is bad,
deliver it "plainly and without cushioning it into vagueness," next to what the
record does support. Honest and kind are compatible, it says, and the skill
requires both.

Then I tried to measure whether any of this survives contact, and mostly
learned about my instrument. Regrading one fixed artifact four times gave 100%,
82%, 82%, and 73%. Of 101 assertions, twelve tell the two configurations apart.
The suite reads 95% against an 88% baseline on two runs each, which my own
notes call "a regression tripwire, not a benchmark."

One assertion came back inverted, and it's the one I'd have picked. It checks
whether a review notices that three options "rest on the same underlying bet
rather than being genuinely different alternatives" — `life-paths`' own
headline failure, the thing the lens machinery exists to prevent. With the
skill: 0 of 2. Without it: 1 of 2.

What I still believe is the trace, though you'll have to take this one on
faith, because I didn't commit it. On one audit eval the run with the skill
made 84 tool calls over 25 minutes and left a plan, an assumptions register, a
facts register, and historical return series it went and fetched. Without it:
10 calls, six minutes, no files, and about the same 10,500 characters of prose.

That 913-line file came after the skill did. Choukhmane, de Silva, Lin, and
Akuzawa [found](https://doi.org/10.2139/ssrn.6446286) 98.3% of simulated LLM
withdrawal advice for ages 65+ sitting at or below 4% of current assets,
against 8.8% under their life-cycle benchmark. I folded it in afterward.

`writing-axes` has no eval corpus yet. The arithmetic is local: the simulators
are standard-library Python with no network imports. That covers the math and
nothing else, though. Your numbers go to a model like anything else you type,
and `financial-planning` searches the web at plan time on purpose.

```
/plugin marketplace add https://github.com/matt-w-horn/skills.git
/plugin install skills@matt-horn-skills
```

A new session picks them up; `/reload-plugins` in one already running.

If a skill fires when it shouldn't, that's the interesting bug. Send me the
query.
