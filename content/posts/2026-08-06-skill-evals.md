+++
title = "Most of my rubric measured nothing"
date = 2026-08-06
author = "Matt Horn"
+++

A Claude skill is a folder with a `SKILL.md` in it: instructions the model loads
by itself when your request matches the description. Writing one is easy.
Knowing whether it changed anything is not. So I built a harness, and the first
thing it measured was my rubric: most of it wasn't testing the skill at all.

Three of them live in [matt-w-horn/skills](https://github.com/matt-w-horn/skills),
separate from the [Lean ones](/posts/2026-08-01-honesty-gates/):

| Skill | What it does |
|---|---|
| `life-paths` | Maps long-term life and career paths from a person's record and finances. |
| `financial-planning` | Builds and stress-tests a saving schedule, retirement timing, and drawdown. |
| `writing-axes` | Routes a writing task through reader, goal, and axis before drafting, then applies that axis's rules. |

The first two ship an eval corpus. `writing-axes` doesn't yet. Worth knowing
before you weigh anything below.

Triggering was the easy half: does the model reach for the skill when it should?
Forty-eight graded queries and a sealed set of sixteen, three runs each, all
sixty-four passing, including near-misses that say "retirement plan" and
"withdrawal" while actually asking about 72(t) mechanics. A keyword matcher
fails those. The score is still worth less than it looks — a perfect run means
the corpus is saturated, so it can catch a regression from here but can't show
an improvement, and it left nothing for description iteration to work on.

The other half is whether the output is worth having, and that needs a
comparison. Each of the eight execution evals runs twice with the skill and
twice without, because a pass rate with no baseline is uninterpretable: if the
model writes the same document unaided, the skill is spending tokens and latency
to change nothing. That came out 95% with, 88% without.

Then the cross-tab, the number I'd want from anyone else selling a skill. Of 101
assertions, twelve discriminate. Eighty-six pass in both configurations, one
inverts, two never pass either way. The headline is mostly reporting what a
competent model does on its own. The judge is noisy on top of that: regrading
one fixed artifact four times returned 100%, 82%, 82%, and 73%, a spread wider
than every per-eval gap but one. Read the small deltas as noise.

What survived isn't a score. On the audit eval, the run with the skill made 84
tool calls over 25 minutes and left a plan, an assumptions register, a facts
register, and historical return series it went and downloaded. The baseline made
10 calls in six minutes and wrote no files. Both produced about 10,500
characters of prose, which is precisely the difference a pass rate cannot see.

`financial-planning` exists because of a measured failure. Choukhmane, de Silva,
Lin, and Akuzawa [found](https://doi.org/10.2139/ssrn.6446286) that 98.3% of
simulated LLM withdrawal advice for ages 65+ sat at or below 4% of current
assets, against 8.8% under their life-cycle benchmark. The result held across
three models. Whether that benchmark is the right target is a separate argument,
since it assumes no bequest motive and a hard mortality bound. The herding is
the part I trust.

The arithmetic is local: the simulators are standard-library Python with no
network imports. That's a claim about the math and nothing else. Your numbers go
to a model like everything else in the conversation. And `financial-planning`
deliberately searches the web at plan time, because contribution limits and
benefit rules go stale faster than any model's memory.

```
/plugin marketplace add https://github.com/matt-w-horn/skills.git
/plugin install skills@matt-horn-skills
```

If a skill fires when it shouldn't, that's the interesting bug. Send me the
query.
