+++
title = "This homepage is a terminal"
date = 2026-07-05
author = "Matt Horn"
+++

The homepage of this site is a terminal. You can `ls` the posts, `cd` around,
and `cat` this one:

```
guest@matthorn.io:~$ cd posts
guest@matthorn.io:~/posts$ cat terminal
```

There is also a small asteroids game in wireframe 3D. Type `play` to find it.

It is about 1,550 lines of vanilla TypeScript over a Hugo static site. There
is no framework. Every page is still an ordinary server-rendered page. If you
turn JavaScript off, the site works the same. The terminal is decoration on
top.

One constraint shaped the code: a strict Content Security Policy with
`script-src 'self'` and no inline scripts. Page data reaches the terminal
through a JSON block the browser will not execute. The pure parts (path
resolution, the game math) run without a DOM, so Node's built-in test runner
covers them.

I am not sure a terminal is good navigation. It is slower than links for most
visitors, and the fallback pages probably get more traffic than the shell. It
stays because I like it. Type `help` and tell me which commands are missing.
