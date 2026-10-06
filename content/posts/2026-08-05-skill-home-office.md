+++
title = "Three skills for the home office"
date = 2026-08-05
author = "Matt Horn"
+++

There is probably a 401k somewhere with your name on it that you have never
once opened. This is far more common than the people who talk about money let
on.

These are three skills for Claude, folders of instructions it picks up and
follows, for the questions that don't fit in one conversation.

| Skill | What it's for |
|---|---|
| [life-paths](https://github.com/matt-w-horn/skills/blob/main/skills/life-paths/SKILL.md) | What you could actually do next, worked out from your record instead of a personality quiz. |
| [financial-planning](https://github.com/matt-w-horn/skills/blob/main/skills/financial-planning/SKILL.md) | Your real numbers turned into a plan: what you can save, when you could stop, what happens if things go badly. |
| [writing-axes](https://github.com/matt-w-horn/skills/blob/main/skills/writing-axes/SKILL.md) | The thing you've been rewriting for a week. |

They ask a lot before they answer anything. [financial-planning](https://github.com/matt-w-horn/skills/blob/main/skills/financial-planning/SKILL.md)
looks up this year's actual contribution limits instead of recalling them, and
it writes down every assumption it makes and what happens if that assumption
is wrong. Then it hands the finished plan to a second copy of itself whose
only job is to find what's wrong with it. That takes 84 tool calls where
answering off the top of its head takes 10.

[life-paths](https://github.com/matt-w-horn/skills/blob/main/skills/life-paths/SKILL.md) has a rule I'd want from a person. It treats both "You can do
anything" and "be realistic, lower your sights" as failures of evidence. It's
meant to tell you what your record supports, commit to a real recommendation,
and then treat your disagreement with it as information. You own the decision.
It just has to show its work.

If what comes up isn't a planning problem, like a crisis at home or health
news, its instruction is to "stop being a process and be present." Planning
resumes later or not at all.

The full version of life-paths runs for hours, so start with the short one.
It's about twenty minutes of questions, and it will tell you once what the
full version would have added.

You add the skills inside Claude, and there's nothing to download:

1. Open Customize Plugins.
2. Under Personal plugins, click the **+**.
3. Choose **Add marketplace**.
4. Paste [matt-w-horn/skills](https://github.com/matt-w-horn/skills).
5. Install it.

After that, all three turn up under the **+** in any chat.

If you happen to use Claude Code, it's `/plugin marketplace add
https://github.com/matt-w-horn/skills.git` and then `/plugin install
skills@matt-horn-skills`.

Pick whichever question is actually bothering you. And if the skill tells you
something that sounds wrong, say so. That part is on purpose.
