+++
title = "A lesson engine in plain files"
date = 2026-07-24
author = "Matt Horn"
+++

I wanted to drill Python and teach a few subjects my own way. Neither belongs
on a hosted course platform. So I built a small engine that runs on my own
machine.

A lesson takes two plain files: `lesson.md` for the prose and the starter code,
`grade.py` for the checks. The editor runs Python as WebAssembly
([Pyodide](https://pyodide.org/)) in the browser. When the checks pass, the
lesson's done. Progress lives in one JSON file in my home directory.

Practice comes in five types, and each one removes a notch of support:

| Type | The learner |
|---|---|
| `read_run` | reads a worked example and runs it |
| `explore` | varies a working program and observes what changes |
| `debug` | fixes a broken program |
| `complete` | fills in the missing part of a partial solution |
| `write` | writes the solution from scratch |

Two old findings from learning research put the types in that order: retrieval
beats rereading, and a solved example beats an unsolved struggle.

The engine vendors everything at install time (about 16 MB), and that's why it
works on a plane and behind a firewall. Nothing you type goes to a server.
There's one network feature, an optional AI check per lesson, and it's off by
default.

The code's on GitHub:
[lesson-engine](https://github.com/matt-w-horn/lesson-engine). If you author
a path with it, tell me what broke.
