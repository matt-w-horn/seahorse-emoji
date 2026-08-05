+++
title = "Three skills and a test harness"
date = 2026-08-06
author = "Matt Horn"
+++

Ask a model when you can retire and you will probably be told 4%. Choukhmane,
de Silva, Lin, and Akuzawa found in 2026 that 98.3% of LLM withdrawal
recommendations sat at or below 4% of assets, where a life-cycle model puts
almost none. 4% is a defensible number. It is also the same number for
everyone, and for most retirees it is far too low.

That herding is what `financial-planning` was built to correct. It's one of
three Claude Code skills in
[matt-w-horn/skills](https://github.com/matt-w-horn/skills), separate from the
[Lean ones](/posts/2026-08-01-honesty-gates/):

| Skill | What it does |
|---|---|
| `life-paths` | Maps long-term life and career paths from a person's actual record and finances. |
| `financial-planning` | Builds and stress-tests a saving schedule, retirement timing, and drawdown. |
| `writing-axes` | Routes a writing task through reader, goal, and axis before drafting, then applies that axis's rules. |

Writing the Markdown is the easy part. The first two ship an eval corpus and a
harness that measures two things separately: whether Claude reaches for the
skill when it should, and whether what comes out is worth having. The first is a
sweep over queries. The second runs the skill end to end and grades the result
against a rubric, using a judge I have to calibrate against a known-good and a
known-bad answer before I'll believe its verdicts.

One rule does most of the work there. Eval queries are authored blind: a trigger
query may not paraphrase the skill's own instructions. Write the corpus with the
`SKILL.md` open and you measure something else: whether the description matches
the body you just read. A linter fails any corpus that shares a five-word phrase
with the body the description doesn't also have.

Two of these ask for real numbers about your life. Those numbers stay in the
conversation you're already having: the bundled simulators are standard-library
Python with no network imports. And `financial-planning` produces analysis for
you to check rather than financial advice, which matters more here than usual
given the failure it targets.

```
/plugin marketplace add https://github.com/matt-w-horn/skills.git
/plugin install skills@matt-horn-skills
```

If a skill fires when it shouldn't, that's the interesting bug. Send me the
query.
