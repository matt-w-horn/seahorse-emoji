+++
title = "Honesty gates for a Lean library"
date = 2026-08-01
author = "Matt Horn"
+++

*Written in a personal capacity. Views are my own, not those of any employer.*

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
proofs, not intent. Intent needs its own gates.

## The gates

I built gates for that second failure inside a formalization project of
mine. Now they are a template you can fork:
[lean-self-audit-template](https://github.com/matt-w-horn/lean-self-audit-template).
The mechanical tier fails the build:

| Gate | Runs in | Fails the build when |
|---|---|---|
| Axiom audit | `lake build` | a `sorry`, a `native_decide`, or a custom axiom appears |
| Statement lock | `lake test` | any declaration's elaborated type changes |
| Coverage gate | `lake test` | a declaration has no recorded reason to exist |
| Negative fixtures | `lake test` | a gate stops catching its ten constructed evasions |

The review tier is judgment with a record. Every docstring gets a
docstring-vs-statement verdict, and a verdict goes stale when either side
changes. The fixtures exist because of one lesson: a gate must be tested
against constructed evasions, not assumed to bite. A check that inspects
nothing still passes.

## The reviewer is a skill

The review tier needs a reviewer, and mine is an agent. I wrote seven
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

Most of their length goes to the second failure, because that is the one you
get no help with. The other bias is verification against the toolchain on
disk. The skills were written against Lean v4.32.0, with the tactic
inventories and error strings extracted from the toolchain rather than
recalled. Mathlib renames things continuously, so the skills tell the agent
to grep the pinned source instead of trusting memory. A remembered lemma
name costs a full rebuild to disprove.

Fork the template, run the rename script, and replace the hello module. Then
tell me which gate fired first. Corrections to the skills are welcome too,
most of all where a version-specific claim went stale. That is the failure
they are most exposed to.
