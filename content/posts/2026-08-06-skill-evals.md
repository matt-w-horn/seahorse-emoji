+++
title = "Three skills for the home office"
date = 2026-08-06
author = "Matt Horn"
+++

Ask a model for a retirement plan and you get a retirement plan: sections,
numbers, a conclusion. Reading it won't tell you whether any of it was checked.

Here's one audit task, run twice. With the skill loaded, 84 tool calls over 25
minutes, and four files on disk afterwards — a plan, an assumptions register, a
facts register, and a return series it went and fetched. Without it, 10 calls,
six minutes, and nothing written down. The two answers ran to about the same
length.

Three skills for the decisions that take more than one conversation. They live
in [matt-w-horn/skills](https://github.com/matt-w-horn/skills), separate from
the [Lean ones](/posts/2026-08-01-honesty-gates/).

| Skill | What it does |
|---|---|
| `life-paths` | Maps long-term life and career paths from a person's record and finances. |
| `financial-planning` | Builds and stress-tests a saving schedule, retirement timing, and drawdown. |
| `writing-axes` | Routes a writing task through reader, goal, and axis before drafting, then applies that axis's rules. |

All three are written for a model that can already dispatch subagents, write
and test its own code, and go looking for facts. They spend their length
scheduling what it reads, and when.

Start with `financial-planning`, which aims at a plan a careful skeptic would
sign. It red-teams its own finished plan with a subagent that didn't write it,
since "the author of a model has already rationalized its weakest assumptions,
and by this stage you are the author." Reference files stay closed until the
stage that needs them, so a requirement lands while the artifact is being
written instead of dozens of tool calls earlier.

`life-paths` drafts career paths with four to six parallel agents under
different lenses, then makes you write each path's bet in one sentence and
compare them. Two that match are one path in different clothes. Nothing ships
without a falsifier, the observable sign, checkable within a few years, that
this path is wrong for you. A restated risk doesn't count.

`writing-axes` runs four gates before a draft exists. The fourth is permission
not to write: when something that already covers it exists, or when the
decision the text depends on hasn't been made yet.

Looking hard at your own record turns up things that aren't planning problems —
a crisis at home, health news. The instruction there is to "stop being a process
and be present." Planning resumes later or not at all.

A full `life-paths` run takes hours across a couple of sessions. Its light mode
trades depth for one sitting, and says once what the long version would have
added.

```
/plugin marketplace add https://github.com/matt-w-horn/skills.git
/plugin install skills@matt-horn-skills
```

A new session picks them up.

If a skill fires when it shouldn't, that's the interesting bug. Send me the
query.
