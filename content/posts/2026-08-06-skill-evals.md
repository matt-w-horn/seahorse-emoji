+++
title = "Three skills for the stuff you've been putting off"
date = 2026-08-06
author = "Matt Horn"
+++

There is probably a 401k somewhere with your name on it that you have never
once opened. This is far more common than the people who talk about money let
on.

These are three skills for Claude — folders of instructions it picks up and
follows — for the questions that don't fit in one conversation.

| Skill | What it's for |
|---|---|
| `life-paths` | What you could actually do next, worked out from your record instead of a personality quiz. |
| `financial-planning` | Your real numbers turned into a plan: what you can save, when you could stop, what happens if things go badly. |
| `writing-axes` | The thing you've been rewriting for a week. |

They ask a lot before they answer anything. `financial-planning` looks up this
year's actual contribution limits rather than recalling them, writes down every
assumption it makes and what happens if that assumption is wrong, and then
hands the finished plan to a second copy of itself whose only job is to find
what's wrong with it. That takes 84 tool calls where answering off the top of
its head takes 10.

`life-paths` has a rule I'd want from a person. "You can do anything" and "be
realistic, lower your sights" are both treated as failures of evidence: it's
meant to tell you what your record actually supports, commit to a real
recommendation, and then treat your disagreement with it as information rather
than error. You own the decision. It just has to show its work.

When what surfaces isn't a planning problem — a crisis at home, health news —
the instruction is to "stop being a process and be present." Planning resumes
later or not at all.

The full version runs for hours. There's a short one, about twenty minutes of
questions, and it will tell you once what the long version would have added.
Start there.

If you use Claude Code:

```
/plugin marketplace add https://github.com/matt-w-horn/skills.git
/plugin install skills@matt-horn-skills
```

Otherwise they work in the Claude app: download
[the repo](https://github.com/matt-w-horn/skills), zip one folder from
`skills/`, and add it under Customize → Skills.

Pick whichever question is actually bothering you. And if it tells you
something that sounds wrong, say so — that part is on purpose.
