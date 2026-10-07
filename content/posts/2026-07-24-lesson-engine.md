+++
title = "A lesson engine in plain files"
date = 2026-07-24
author = "Matt Horn"
+++

The lesson engine runs coding lessons on your own machine and checks your
work. I built it because I wanted to re-learn ordinary differential equations
in SciPy and couldn't find a tutorial for that combination. Nothing about that
belongs on a hosted course platform.

A lesson is two plain files: `lesson.md` holds the prose and the starter
code, `grade.py` holds the checks. You've finished a lesson when its checks
pass. The editor is a local web app that runs Python as WebAssembly
([Pyodide](https://pyodide.org/)) in the browser. The engine keeps your
progress in one JSON file in your home directory.

There are five lesson types. They differ in how much of the answer is already
in front of you:

| Type | You |
|---|---|
| `read_run` | read a worked example and run it |
| `explore` | vary a working program and observe what changes |
| `debug` | fix a broken program |
| `complete` | fill in the missing part of a partial solution |
| `write` | write the solution from scratch |

I put the types in that order because of two learning effects. Retrieving
material from memory beats rereading it, though only at a delay: on an
immediate test it loses. And for someone new to the material, studying a
solution beats attempting the problem unaided, an advantage that reverses once
they already know it. Fading reconciles the two, and it is what the five types
do in order: they take the worked example away one step at a time.

The engine vendors everything at install time, Pyodide included: it keeps its
own copy of what it depends on, so once installed it works on a plane and
behind a firewall.

Only one feature sends anything off your machine: an AI check per lesson, off
by default, which posts your code and the lesson prompt to a model.

The code is on GitHub:
[lesson-engine](https://github.com/matt-w-horn/lesson-engine). If you run a
lesson, tell me what broke.
