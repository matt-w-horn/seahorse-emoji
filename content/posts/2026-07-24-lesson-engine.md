+++
title = "A lesson engine in plain files"
date = 2026-07-24
author = "Matt Horn"
+++

A lesson is two plain files: `lesson.md` holds the prose and the starter
code, `grade.py` holds the checks. It is complete when the checks pass. The
editor is a local web app that runs Python as WebAssembly
([Pyodide](https://pyodide.org/)) in the browser. Progress is one JSON file in
your home directory.

I built it because I wanted to re-learn ordinary differential equations in
SciPy and could not find a tutorial for that combination. Nothing about that
belongs on a hosted course platform.

The five types differ in how much of the answer is already in front of you:

| Type | You |
|---|---|
| `read_run` | read a worked example and run it |
| `explore` | vary a working program and observe what changes |
| `debug` | fix a broken program |
| `complete` | fill in the missing part of a partial solution |
| `write` | write the solution from scratch |

Two effects shaped that order. Retrieval beats rereading, though only at a
delay: on an immediate test it loses. And a studied solution beats an unaided
attempt for someone new to the material, an advantage that reverses once they
already know it. What reconciles the two is fading, which is the thing the
sequence is actually doing: take the worked example away one step at a time.

The engine vendors everything at install time, Pyodide included, so once
installed it works on a plane and behind a firewall. One feature sends
anything off the machine: an AI check per lesson, off by default, which posts
your code and the lesson prompt to a model.

The code is on GitHub:
[lesson-engine](https://github.com/matt-w-horn/lesson-engine). If you run a
lesson, tell me what broke.
