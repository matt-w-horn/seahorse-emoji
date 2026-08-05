+++
title = "When a correct proof is a lie: honesty gates for a Lean library"
date = 2026-08-01
author = "Matt Horn"
+++

_**TL;DR:** Lean's kernel checks proofs, not the prose around them. This
post is the machinery I use to close that gap: a blinded, calibrated
Claude referee for docstring-vs-statement claims, and mechanical gates
for everything else. The claims gate ships in advisory mode: it prints
findings, and failing the build on a model's verdict is a switch you flip
yourself. The referee ships as a Claude Code skill in
[lean-skills (github)](https://github.com/matt-w-horn/lean-skills), and
the whole gate stack as a fork-ready template in
[lean-self-audit-template (github)](https://github.com/matt-w-horn/lean-self-audit-template)._

What takes longest to internalize about [Lean](https://lean-lang.org/) is how
narrow the kernel's guarantee is. A
proof that doesn't establish its statement will not compile. A statement that
doesn't mean **what you meant** compiles just fine:

```lean
import Mathlib

-- This compiles. In Lean, division by zero is zero.
example (x : ℝ) : x / 0 = 0 := div_zero x
```

Lean defines division by zero this way on purpose; Kevin Buzzard's
[FAQ](https://xenaproject.wordpress.com/2020/07/05/division-by-zero-in-type-theory-a-faq/)
covers the reasoning. The consequence is that a theorem about a ratio
can hold at a zero denominator for reasons that have nothing to do with the
mathematics. The kernel isn't wrong, but it doesn't check intent.

"Intent" needs its own gate. A careful human is the obvious one, but the humans
capable of doing this are already very busy. I wanted gates that run at machine
speed and that I'd trust the way I trust my own reading. I built them while
formalizing something of my own, and they're now included in a template you can
fork:
[lean-self-audit-template (github)](https://github.com/matt-w-horn/lean-self-audit-template).
The one that needs a model is the hardest to get right, so I'll start there.

## Reviewing the claim, not the proof

Here's a pair from the template's
[calibration set](https://github.com/matt-w-horn/lean-self-audit-template/tree/main/tests/claims-calibration).
Lean checked the statement.
The docstring is what a human reads in addition to the statement.

```lean
/-- The inverse cancels: for any real `a`,
the product `a⁻¹ * a` is `1`. -/
theorem inv_mul_cancel_of_pos :
    ∀ {a : ℝ}, 0 < a → a⁻¹ * a = 1
```

Lean accepted both the proof and the statement. The docstring is the part that
is wrong: it drops `0 < a`, and at `a = 0` the product is `0`. The kernel has
no opinion, because docstrings are comments.

Catching that is a review problem, so it needs a reviewer. In this case, it's a
referee with a deliberately small job. It sees one docstring-statement pair (and
the verified docstrings of that declaration's direct dependencies) and nothing
else from the project. Tooling enforces the blinding: the referee has no file
access at all, only a probe command and web search, so nothing here rests on it
following an instruction. Web search can in principle reach the public repo, which is a hole I've
left open because closing it costs the referee the mathematical background it
needs. It isn't allowed to trust its own reading of the statement; it writes
small Lean probes, elaborates them against the real toolchain, and only then
returns a verdict. For the pair above the verdict is `prose-overclaims`, with
the counterexample attached.

A verdict of `supported` or `accepted` goes into a ledger, `tests/claims.lock`
([example](https://github.com/matt-w-horn/overload/blob/main/tests/claims.lock)),
keyed by hash. Every other verdict
[routes to a fix](https://github.com/matt-w-horn/lean-self-audit-template/blob/main/claims-contract.md):
`prose-overclaims` sends the docstring back to be
rewritten, and a verdict that indicts the statement instead of the prose comes
to me. Change the statement and
the verdict goes stale. Change the docstring and the verdict goes stale. A stale
verdict is reported on every test run until someone re-referees the pair.

## Why one pair at a time

The reason for the narrowness is auditability: hand a model a whole Lean file
and it will tell you the file looks right, and it might even be correct. What it
won't hand back is a record you can check later. One declaration, one docstring,
one verdict, one hash is a claim I can re-examine in six months. A file-level
verdict gives me nothing to re-examine.

So the sweep runs a breadth-first search up the dependency tree from the base
axioms. Each wave holds the declarations whose dependencies already have
verdicts, so a wave's members are independent and go out together; my library
takes on the order of ten waves, and a deeper dependency chain takes
proportionally more. The ordering
falls out of the hashing: a row commits to its direct dependencies' docstrings,
so verified context can only accumulate bottom-up. This approach found real
errors, some in the Lean and some in the docstring.

Opus 5 does the refereeing. Fable 5
orchestrates the run and applies fixes as verdicts come in.

The first sweep is the expensive part. The 700-odd pairs in my own library came
to about a hundred dollars all in, referee plus orchestration: roughly $0.14 a
pair. Mathlib has about 74,000 docstrings, which puts a first sweep there near
$10,000. That is why I run this against a library I wrote.

After the first sweep it's cheap, because a verdict only goes stale when one of
its inputs moves. Each row is keyed on three hashes: the printed statement, the
docstring, and the sorted docstrings of the declaration's direct dependencies.
It is not keyed on the referee model or its prompt, and a re-run is never
compared against the stored verdict, so a row records one sample from a
stochastic process and nothing here would notice if a second sample disagreed.
Edit one docstring and every consumer of that declaration needs re-refereeing.
The dependency graph comes from `getUsedConstantsAsSet`, which walks proof
bodies, so it sees what the proof actually used; the statement's own vocabulary
doesn't come into it.

Proof bodies are the exception, and deliberately so. Golf a theorem's proof or
rewrite the tactic block and no verdict goes stale, because proof irrelevance
means the body was never part of what the statement claims. Reach for different
lemmas while you're in there and the dependency set moves, which does stale the
row, and that is the behaviour you want: the referee was handed those docstrings
as verified context. A definition's body is different, because there the body
*is* the meaning. The statement lock hashes the body and the ledger never sees
it, so changing a `def`'s body trips that gate while the claims verdicts stay
green.
I learned the distinction from a definition that changed body with no header
drift reported.

## The referee gets evaluated too

A lazy referee is worse than no referee, because it produces green. So it's
calibrated before its verdicts count. The template ships fifteen pairs, and only
nine carry a defect I planted:

- a dropped hypothesis
- an "iff" where only one direction is proved
- uniqueness claimed over bare existence
- a statement whose hypotheses can never hold at once

Five more are honest, three of those lifted straight from Mathlib, and the
fifteenth is genuinely ambiguous. A configuration means one model at one effort
level with one prompt revision, and it has to match the answer key on all
fifteen before I let it write to the ledger, which means calling the honest
pairs honest and the ambiguous one ambiguous. A confident wrong answer there
disqualifies it as surely as a miss. The set that certifies the referee is also
the set I tuned it on, so there is no held-out split, and fifteen binary items
bound very little.

## The gates that need no model

Under the referee sit the mechanical gates. Each one hard-fails the build:

| Gate | Fails the build when |
|---|---|
| Axiom audit | a `sorry` or a custom axiom appears |
| Statement lock | any declaration's statement changes |
| Coverage gate | a declaration has no recorded reason to exist |
| Phantom references | a docstring backtick-cites something that doesn't exist |
| Silencing guard | a commit weakens a linter, or adds `axiom`, `unsafe`, or `partial` |
| Negative fixtures | a gate misses a constructed evasion |

Four of those fire on defects in the library. The last two police the gates
themselves: the fixtures catch a gate that stopped biting, and the silencing
guard catches someone weakening one.

The axiom audit is the one I'd port to any project
([example](https://github.com/matt-w-horn/overload/blob/main/Overload/AxiomAudit.lean)):
every declaration has to reduce to
[`propext`](https://leanprover-community.github.io/mathlib4_docs/find/?pattern=propext#doc),
[`Classical.choice`](https://leanprover-community.github.io/mathlib4_docs/find/?pattern=Classical.choice#doc),
and [`Quot.sound`](https://leanprover-community.github.io/mathlib4_docs/find/?pattern=Quot.sound#doc)
and nothing else. That's the check the Lean reference describes under
[Validating a Lean Proof](https://lean-lang.org/doc/reference/latest/ValidatingProofs/).
A stray `sorry` or a `native_decide` fails the build instead of sitting in the
library looking finished. `lake build` runs mine, and a source-level scan runs
beside it. The scan is there because of one
hole no environment sweep can close: Lean never adds an `example` to the
environment, so a `sorry` inside one compiles and never moves the count. Only
reading the source catches that.

Two things went wrong there that I didn't predict. The audit prints a count, and
for a while two copies of it printed different counts, 914 against 919, with
nothing comparing the two numbers; they get diffed character for character now.
And a syntax linter only runs in modules that transitively import it, so `decide
+native`, the config-flag spelling of `native_decide`, once elaborated in a
slim-import module with no warning at all. A separate gate now forces every
module to reach the carrier.

The negative fixtures are the row I'd argue for hardest: eleven files that are
supposed to fail
([example](https://github.com/matt-w-horn/overload/tree/main/tests/negative)).
Five have to fail to elaborate; the other six compile
cleanly, and the source-level scan has to catch them anyway. A check that
inspects nothing still passes, and the only way to know a gate bites is to
feed it something it has to reject.

Then one of them stopped being a fixture. An import drifted, the file quietly
stopped elaborating, and nothing noticed, because the only gate that ever read
it was the scanner and the scanner was still happy. The test of the test had
rotted and the suite stayed green the whole time. The runner now checks that the
compile-cleanly fixtures still compile.

## Re-checking the kernel's own work

Independent re-checking of exported proofs is an old idea, and
Lean has had external checkers for years. What Leonardo de Moura's
[Who Watches the Provers?](https://leodemoura.github.io/blog/2026-3-16-who-watches-the-provers/)
(March 2026) documents is the new pressure: AI is now finding kernel bugs
(seven in Rocq this year, with Claude assisting), and the
[Lean Kernel Arena](https://arena.lean-lang.org/) benchmarks the independent
checkers against each other. That prompted me to close a gap here: none of
the gates above re-check the kernel's own work, so a weekly CI job now
replays the library's full export through
[Nanoda (github)](https://github.com/ammkrn/nanoda_lib), one of those independent
kernels, written in Rust.

## The referee is a skill

The referee ships as one of seven Claude Code skills for Lean, in
[lean-skills (github)](https://github.com/matt-w-horn/lean-skills), each
loading only when its task comes up. I wrote them against Lean v4.32.0, with
the tactic inventories and error strings read out of that toolchain.
[Mathlib](https://github.com/leanprover-community/mathlib4) renames things
continuously, so the skills tell the agent to grep the pinned source in
`.lake/packages/mathlib/`; a remembered lemma name costs a full rebuild to
disprove. They carry their own checks too:
[`tools/validate_skills.py`](https://github.com/matt-w-horn/lean-skills/blob/main/tools/validate_skills.py)
runs in CI over structure and cross-references, so a broken pointer fails
before it can send an agent somewhere that doesn't exist.

Fork the template, run the rename script, replace the hello module, and tell me
which gate fires first. Corrections
to the skills are welcome too, especially where a version-specific claim has
gone stale. That's the failure they're most exposed to.
