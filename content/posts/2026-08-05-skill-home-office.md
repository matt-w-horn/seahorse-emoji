+++
title = "Three Claude skills for career, finance, and writing"
date = 2026-08-05
author = "Matt Horn"
+++

Open-ended questions (what role your track record actually supports, how tax and contribution rules interact across accounts, or why a draft isn't landing) usually fail in a single chat turn because the model answers before it has the constraints. Below are three Claude skills that structure those problems as multi-step workflows with explicit verification passes:

| Skill | What it's for |
|---|---|
| [life-paths](https://github.com/matt-w-horn/skills/blob/main/skills/life-paths/SKILL.md) | Career and role decisions worked out from concrete evidence in your record rather than generic advice. |
| [financial-planning](https://github.com/matt-w-horn/skills/blob/main/skills/financial-planning/SKILL.md) | Your actual numbers turned into a stress-tested plan: savings rates, tax buckets, and downside scenarios. |
| [writing-axes](https://github.com/matt-w-horn/skills/blob/main/skills/writing-axes/SKILL.md) | Audience-and-goal-first drafting, structural diagnosis, and de-slop review for human-facing prose. |

They gather constraints and verify facts before generating an answer. [financial-planning](https://github.com/matt-w-horn/skills/blob/main/skills/financial-planning/SKILL.md)
looks up this year's actual contribution limits instead of recalling them from weights,
writes down every assumption it makes and what happens if that assumption is
wrong, and hands the finished plan to a second copy of itself whose only job is
to find what's wrong with it. That takes 84 tool calls where answering off the
top of its head takes 10.

[life-paths](https://github.com/matt-w-horn/skills/blob/main/skills/life-paths/SKILL.md) enforces an evidence gate: both ungrounded optimism and reflexively conservative advice count as failures of analysis. It inventories what your record actually supports, commits to a concrete recommendation, and treats your pushback as additional signal. You own the decision; the skill has to show its work.

It also defines an explicit scope boundary: if the input is an acute personal or medical emergency rather than a planning problem, the workflow halts instead of forcing a decision tree onto it.

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

Start with whichever question is actually on your mind. And if a skill pushes
back with something that doesn't sit right, push back on it. That part is on
purpose.
