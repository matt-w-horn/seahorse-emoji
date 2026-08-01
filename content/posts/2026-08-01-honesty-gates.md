+++
title = "Honesty gates for a Lean library"
date = 2026-08-01
author = "Matt Horn"
+++

Lean's kernel checks every proof. A proof that does not establish its
statement will not compile. The kernel checks nothing else. A statement that
does not mean what you intended compiles without complaint:

```lean
import Mathlib

-- This compiles. Division by zero is defined as zero in Lean.
example (x : ℝ) : x / 0 = 0 := div_zero x
```

So a theorem about a ratio can hold at a zero denominator for reasons that
have nothing to do with the mathematics. The kernel is not wrong. It checks
proofs, not intent. Intent needs its own gates. I built them inside a
formalization project of mine, and they are now a template you can fork:
[lean-self-audit-template](https://github.com/matt-w-horn/lean-self-audit-template).
The most useful gate is a judge, so I will show that one first.

## The judge, shown

Here is a real pair from the template's calibration set. The statement is
what Lean checked. The docstring is what a reader is told.

```lean
/-- The inverse cancels: for any real `a`, the product `a⁻¹ * a` is `1`. -/
theorem inv_mul_cancel_of_le : ∀ {a : ℝ}, 0 < a → a⁻¹ * a = 1
```

The proof is fine. The statement is fine. The docstring lies. It drops
`0 < a`, and at `a = 0` the product is `0`, not `1`. The kernel has no
opinion, because docstrings are comments.

The judge is an LLM referee with a narrow job. It sees one
docstring-statement pair, blinded from the rest of the project. It must not
trust its own reading of the statement. It writes small Lean probes,
elaborates them against the real toolchain, and only then records a verdict.
For the pair above the verdict is `prose-overclaims`, with the
counterexample attached.

Verdicts land in a ledger (`tests/claims.lock`), keyed by hash. If the
statement changes, the verdict goes stale. If the docstring changes, the
verdict goes stale. A stale verdict is reported on every test run until the
pair is re-refereed.

A judge can also be lazy, so the judge is examined first. The template ships
fifteen calibration pairs with known defects:

- a dropped hypothesis
- an "iff" claimed where one direction is proved
- uniqueness claimed over a bare existence
- a vacuous statement whose hypotheses cannot hold at once

A referee configuration must get these right before its verdicts count.

## The mechanical tier

Under the judge sit gates that need no model at all. Each one hard-fails
the build:

| Gate | Fails the build when |
|---|---|
| Axiom audit | a `sorry` or a custom axiom appears |
| Statement lock | any declaration's statement changes |
| Coverage gate | a declaration has no recorded reason to exist |
| Negative fixtures | a gate misses a constructed evasion |

The fixtures are the gates' own test: ten expected-failure files. That rule
came from one lesson. A check that inspects nothing still passes.

## The referee is a skill

My referee runs as one of seven
[Claude Code skills for Lean](https://github.com/matt-w-horn/lean-skills),
split by task rather than topic, so each loads only when its task comes up:

| Skill | For |
|---|---|
| `lean-proving` | writing Lean, and deciding whether something is provable |
| `lean-refactoring` | simplifying proofs without touching statements |
| `lean-latex-sync` | prose that describes Lean code |
| `lean-verification` | asking whether work is correct and complete |
| `lean-claims-review` | refereeing a claims ledger like the one above |
| `lake` | the build |
| `loogle` | finding a lemma that probably already exists |

I wrote the skills against Lean v4.32.0. The tactic inventories and error
strings come from the toolchain, not from memory. Mathlib renames things
continuously, so the skills tell the agent to grep the pinned source instead
of memory. A remembered lemma name costs a full rebuild to disprove.

Fork the template, run the rename script, and replace the hello module. Then
tell me which gate fired first. Corrections to the skills are welcome too,
most of all where a version-specific claim went stale. That is the failure
they are most exposed to.
