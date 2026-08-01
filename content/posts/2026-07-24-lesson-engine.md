+++
title = "A lesson engine in plain files"
date = 2026-07-24
author = "Matt Horn"
+++

*Written in a personal capacity. Views are my own, not those of any employer.*

I wanted to drill Python and teach a few subjects my own way. Neither belongs
on a hosted course platform. So I built a small engine that runs on my own
machine.

A lesson is two plain files. `lesson.md` holds the prose and the starter
code. `grade.py` holds the checks. The editor runs Python as WebAssembly
([Pyodide](https://pyodide.org/)) in the browser. A lesson is complete when
its checks pass. Progress is one JSON file in my home directory.

Practice comes in five types, and each one removes a notch of support:

| Type | The learner |
|---|---|
| `read_run` | reads a worked example and runs it |
| `explore` | varies a working program and observes what changes |
| `debug` | fixes a broken program |
| `complete` | fills in the missing part of a partial solution |
| `write` | writes the solution from scratch |

Two old findings from learning research shaped the ladder: retrieval beats
rereading, and a solved example beats an unsolved struggle.

The engine vendors everything at install time (about 16 MB). It works on a
plane and behind a firewall. Nothing you type goes to a server. There is one
network feature: an optional AI check per lesson, off by default.

The code is on GitHub:
[lesson-engine](https://github.com/matt-w-horn/lesson-engine). If you author
a path with it, tell me what broke.
