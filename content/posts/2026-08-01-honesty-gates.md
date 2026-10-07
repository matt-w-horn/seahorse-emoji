+++
title = "When a correct proof is a lie: honesty gates for a Lean library"
date = 2026-08-01
author = "Matt Horn"
+++

_**TL;DR:** A Lean library can build green while a docstring (the comment
a human reads above a declaration) claims more than its theorem proves,
because Lean's kernel checks proofs and doesn't check the prose around them.
This post describes the machinery I use to close that gap: a blinded,
calibrated Claude referee for docstring-vs-statement claims, and mechanical
gates for everything else. The claims gate ships in advisory mode. It prints
findings, and you flip a switch yourself if you want a model's verdict to fail
the build. The referee ships as a Claude Code skill in
[lean-skills (github)](https://github.com/matt-w-horn/lean-skills), and
the whole gate stack as a fork-ready template in
[lean-self-audit-template (github)](https://github.com/matt-w-horn/lean-self-audit-template)._

The thing about [Lean](https://lean-lang.org/) that took me longest to
internalize is how narrow the kernel's guarantee is. A proof that doesn't
establish its statement will not compile. A statement that doesn't mean *what
you meant* compiles fine:

```lean
import Mathlib

-- This compiles. In Lean, division by zero is zero.
example (x : ℝ) : x / 0 = 0 := div_zero x
```

Lean defines division by zero this way on purpose; Kevin Buzzard's
[FAQ](https://xenaproject.wordpress.com/2020/07/05/division-by-zero-in-type-theory-a-faq/)
covers the reasoning. As a result, a theorem about a ratio can hold at a zero
denominator for reasons that have nothing to do with the mathematics. The
kernel isn't wrong, but it doesn't check intent.

So I needed a separate gate for intent. A careful human is the obvious one, but
the humans capable of doing this are already very busy. I wanted gates that run
at machine speed and that I'd trust the way I trust my own reading. I built
them while formalizing something of my own, and I've put them in a template you
can fork:
[lean-self-audit-template (github)](https://github.com/matt-w-horn/lean-self-audit-template).
The gate that needs a model is the hardest to get right, so I'll start there.

## Reviewing what the docstring claims

Here's a pair, one docstring and the statement it describes. It comes from the
template's
[calibration set](https://github.com/matt-w-horn/lean-self-audit-template/tree/main/tests/claims-calibration),
the pairs with known answers that I test the referee against.
Lean checked the statement.
A human also reads the docstring, the comment above it.

```lean
/-- The inverse cancels: for any real `a`,
the product `a⁻¹ * a` is `1`. -/
theorem inv_mul_cancel_of_pos :
    ∀ {a : ℝ}, 0 < a → a⁻¹ * a = 1
```

Lean accepted both the proof and the statement. The docstring is the part that
is wrong: it drops `0 < a`, and at `a = 0` the product is `0`. The kernel has
no opinion, because docstrings are comments.

Someone has to review the docstring to catch that. My reviewer is a model,
which I call the referee, and I gave it a deliberately small job. It sees one
docstring-statement pair (and the verified docstrings of that declaration's
direct dependencies) and nothing else from the project. I enforce the blinding
with tooling: the referee has no file access at all, only a probe command and
web search, so I'm not relying on it to follow an instruction. Web search can
in principle reach the public repo. I've left that hole open, because closing
it would cost the referee the mathematical background it needs. The referee
isn't allowed to trust its own reading of the statement. It writes small Lean
probes, elaborates them against the real toolchain (Lean itself type-checks
each one), and only then returns a verdict. For the pair above it returns
`prose-overclaims`, with the counterexample attached.

A verdict of `supported` or `accepted` goes into a ledger, `tests/claims.lock`
([example](https://github.com/matt-w-horn/overload/blob/main/tests/claims.lock)),
a file with one row per verdict, keyed by hash. Every other verdict
[routes to a fix](https://github.com/matt-w-horn/lean-self-audit-template/blob/main/claims-contract.md):
on `prose-overclaims` the docstring goes back to be rewritten, and when the
referee indicts the statement itself, the pair comes to me. If you change the
statement or the docstring, its hash no longer matches the row, and the verdict
is stale. Every test run reports a stale verdict until someone re-referees the
pair.

## Why one pair at a time

I keep the job that narrow so that I can audit it. Hand a model a whole Lean
file and it will tell you the file looks right. It might even be correct, but
it won't give you a record you can check later. With one declaration, one
docstring, one verdict, and one hash, I have a claim I can re-examine in six
months.

A sweep is a pass over the whole library. I run it as a breadth-first search up
the dependency tree from the base axioms: it clears one level of the tree, a
wave, before it starts on the level above. Each wave holds the declarations
whose dependencies already have verdicts, so the members of a wave are
independent and go out together. My library takes on the order of ten waves,
and a deeper dependency chain takes proportionally more. The hashing forces
that order: a row commits to its direct dependencies' docstrings, so verified
context can only accumulate from the bottom up. I found real errors this way,
some in the Lean and some in the docstrings.

Opus 5 does the refereeing. Fable 5
orchestrates the run and applies fixes as verdicts come in.

The first sweep is the expensive part. The 700-odd pairs in my own library cost
me about a hundred dollars all in, referee plus orchestration: roughly $0.14 a
pair. Mathlib has about 74,000 docstrings, so a first sweep there would cost
near $10,000. That is why I run this against a library I wrote.

After the first sweep it's cheap, because a verdict only goes stale when one of
its inputs changes. I key each row on three hashes: the printed statement, the
docstring, and the sorted docstrings of the declaration's direct dependencies.
I don't key it on the referee model or its prompt, and I never compare a re-run
against the stored verdict, so a row records one sample from a stochastic
process and nothing here would notice if a second sample disagreed. Edit one
docstring and every consumer of that declaration needs re-refereeing. I get the
dependency graph from `getUsedConstantsAsSet`, which walks proof bodies, so it
sees what the proof used; the statement's own vocabulary doesn't come into it.

I made proof bodies the exception on purpose. Golf a theorem's proof (shorten
it without changing what it proves) or rewrite the tactic block and no verdict
goes stale. Under proof irrelevance, Lean's rule that any two proofs of the
same statement count as equal, the body was never part of what the statement
claims. If you use different lemmas while you're in there, the dependency set
changes and the row does go stale. You want that, because the referee was
handed those docstrings as verified context. A definition's body is different,
because there the body *is* the meaning. The statement lock, one of the
mechanical gates below, hashes the body and the ledger never sees it, so
changing a `def`'s body trips that gate while the claims verdicts stay green.
I learned the distinction from a definition that changed body with no header
drift reported.

## The referee gets evaluated too

A lazy referee is worse than no referee, because it produces green. So I
calibrate it before its verdicts count. The template ships fifteen pairs, and I
planted a defect in only nine:

- a dropped hypothesis
- an "iff" where only one direction is proved
- uniqueness claimed over bare existence
- a statement whose hypotheses can never hold at once

Five more are honest, three of those lifted straight from Mathlib, and the
fifteenth is ambiguous. I calibrate a configuration, meaning one model at one
effort level with one prompt revision. A configuration has to match the answer
key on all fifteen before I let it write to the ledger, which means calling the
honest pairs honest and the ambiguous one ambiguous. If it gives a confident
wrong answer on one of those, I disqualify it, the same as for a miss. I tuned
the referee on the same set that certifies it, so there is no held-out split,
and fifteen binary items bound very little.

## The gates that need no model

The mechanical gates sit under the referee. Each one hard-fails the build:

| Gate | Fails the build when |
|---|---|
| Axiom audit | a `sorry` or a custom axiom appears |
| Statement lock | any declaration's statement changes |
| Coverage gate | a declaration has no recorded reason to exist |
| Phantom references | a docstring backtick-cites something that doesn't exist |
| Silencing guard | a commit weakens a linter, or adds `axiom`, `unsafe`, or `partial` |
| Negative fixtures | a gate misses a constructed evasion |

The first four fire on defects in the library. The last two check the gates
themselves: the fixtures catch a gate that no longer rejects what it should,
and the silencing guard catches someone weakening one.

The axiom audit is the one I'd port to any project
([example](https://github.com/matt-w-horn/overload/blob/main/Overload/AxiomAudit.lean)):
every declaration has to reduce to
[`propext`](https://leanprover-community.github.io/mathlib4_docs/find/?pattern=propext#doc),
[`Classical.choice`](https://leanprover-community.github.io/mathlib4_docs/find/?pattern=Classical.choice#doc),
and [`Quot.sound`](https://leanprover-community.github.io/mathlib4_docs/find/?pattern=Quot.sound#doc)
and nothing else. That's the check the Lean reference describes under
[Validating a Lean Proof](https://lean-lang.org/doc/reference/latest/ValidatingProofs/).
Without the audit, a stray `sorry` (Lean's placeholder for a proof that hasn't
been written) or a `native_decide` (a tactic that proves a goal by running
compiled code and taking the compiler's word for the result) sits in the
library looking finished. With it, either one fails the build. `lake build`
runs mine, and a source-level scan runs beside it. I added the scan because of
one hole that no environment sweep can close: Lean never adds an `example` to
the environment, so a `sorry` inside one compiles and never moves the audit's
count. You can only catch it by reading the source.

Two things went wrong there that I didn't predict. The audit prints a count, and
for a while two copies of it printed different counts, 914 against 919, with
nothing comparing the two numbers. I diff them character for character now.
And a syntax linter only runs in modules that transitively
import it, so `decide +native`, the config-flag spelling of `native_decide`,
once elaborated in a slim-import module with no warning at all. A separate gate
now forces every module to reach the carrier, the module that holds the linter.

The negative fixtures are the row I'd argue for hardest. A check that
inspects nothing still passes, and the only way to know a gate works is to
feed it something it has to reject. The fixtures are eleven files that are
supposed to fail
([example](https://github.com/matt-w-horn/overload/tree/main/tests/negative)).
Five have to fail to elaborate; the other six compile
cleanly, and the source-level scan has to catch them anyway.

Then one of them stopped being a fixture. An import drifted, the file
stopped elaborating, and nothing noticed, because the only gate that ever read
it was the scanner and the scanner was still happy. The test of the test had
rotted and the suite stayed green the whole time. The runner now checks that the
compile-cleanly fixtures still compile.

## Re-checking the kernel's own work

None of the gates above re-check the kernel's own work. Independent re-checking
of exported proofs is an old idea, and
Lean has had independent checkers for years. Leonardo de Moura's
[Who Watches the Provers?](https://leodemoura.github.io/blog/2026-3-16-who-watches-the-provers/)
(March 2026) documents the new pressure: AI is now finding kernel bugs
(seven in Rocq this year, with Claude assisting), and the
[Lean Kernel Arena](https://arena.lean-lang.org/) benchmarks the independent
checkers against each other. That prompted me to close the gap: a weekly CI job
now replays the library's full export through
[Nanoda (github)](https://github.com/ammkrn/nanoda_lib), one of those
checkers, written in Rust.

## The referee is a skill

The referee ships as one of seven Claude Code skills for Lean, in
[lean-skills (github)](https://github.com/matt-w-horn/lean-skills). Each skill
loads only when its task comes up. I wrote them against Lean v4.32.0, and I
read the tactic inventories and error strings out of that toolchain.
[Mathlib](https://github.com/leanprover-community/mathlib4) renames things
continuously, so the skills tell the agent to grep the pinned source in
`.lake/packages/mathlib/`; if the agent uses a lemma name from memory and the
name is wrong, it costs a full rebuild to find out. The skills carry their own
checks too:
[`tools/validate_skills.py`](https://github.com/matt-w-horn/lean-skills/blob/main/tools/validate_skills.py)
runs in CI over structure and cross-references, so a broken pointer fails
before it can send an agent somewhere that doesn't exist.

Fork the template, run the rename script, replace the hello module, and tell me
which gate fires first. I'd welcome corrections to the skills too, especially
where a version-specific claim has gone stale. That's the failure they're most
exposed to.
