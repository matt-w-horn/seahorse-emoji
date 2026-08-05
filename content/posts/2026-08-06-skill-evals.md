+++
title = "Three skills for the home office"
date = 2026-08-06
author = "Matt Horn"
+++

Three skills for the decisions that happen at my own desk: what to do with a
career, whether the money supports a change, and whether a piece of writing is
worth sending. They live in
[matt-w-horn/skills](https://github.com/matt-w-horn/skills), separate from the
[Lean ones](/posts/2026-08-01-honesty-gates/).

| Skill | What it does |
|---|---|
| `life-paths` | Maps long-term life and career paths from a person's record and finances. |
| `financial-planning` | Builds and stress-tests a saving schedule, retirement timing, and drawdown. |
| `writing-axes` | Routes a writing task through reader, goal, and axis before drafting, then applies that axis's rules. |

What separates them from a well-phrased prompt is that they write things down.
On one audit eval, the run with the skill made 84 tool calls over 25 minutes and
left behind a plan, an assumptions register, a facts register, and historical
return series it went and fetched. The same task without the skill took 10 calls
and six minutes, and wrote no files at all. Both produced about 10,500
characters of prose, so the difference sits entirely in what was left on disk.

That difference is invisible to a score — the useful thing I learned from
building evals for them. Triggering was the easy half: 48 graded queries and a
sealed set of 16, three runs each, all 64 passing — a result that mostly means
the corpus is saturated and can't show an improvement from here. The execution
half runs each eval twice with the skill and twice without, because a pass rate
with no baseline is uninterpretable. That came out 95% against 88%.

Then the number I'd want from anyone else. Of 101 assertions, twelve
discriminate; 86 pass in both configurations. The headline is mostly reporting
what a competent model does unaided. Regrading one fixed artifact four times
returned 100%, 82%, 82%, and 73%, a spread wider than every per-eval gap but
one, so the small deltas are noise. What survives is the tool-call trace above.

`financial-planning` came first, and the research came later. Choukhmane, de
Silva, Lin, and Akuzawa [found](https://doi.org/10.2139/ssrn.6446286) that 98.3%
of simulated LLM withdrawal advice for ages 65+ sat at or below 4% of current
assets, against 8.8% under their life-cycle benchmark, holding across three
models. I folded that in afterward, where it became the demand-modeled trigger
queries and three of the assertions. Whether their benchmark is the right target
is a separate argument, since it assumes no bequest motive and a hard mortality
bound. The herding is the part I trust.

`writing-axes` has no eval corpus yet. Worth knowing, given everything above.

The arithmetic stays local: the simulators are standard-library Python with no
network imports. That's a claim about the math and nothing else. Your numbers go
to a model like everything else in the conversation, and `financial-planning`
searches the web at plan time on purpose, because contribution limits and
benefit rules go stale faster than a model's memory.

```
/plugin marketplace add https://github.com/matt-w-horn/skills.git
/plugin install skills@matt-horn-skills
```

If a skill fires when it shouldn't, that's the interesting bug. Send me the
query.
