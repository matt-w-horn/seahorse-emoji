+++
title = "This homepage is a terminal"
date = 2026-07-05
author = "Matt Horn"
+++

You can `ls` the posts, `cd` around, and `cat` this one:

```
guest@matthorn.io:~$ cd posts
guest@matthorn.io:~/posts$ cat terminal
```

If you're reading this as an ordinary page, that shell is at [the site
root](/). `play` runs an asteroids game in wireframe 3D.

The terminal is about 1,100 lines of TypeScript with no framework and no
runtime dependencies; the game adds about another 2,100 on top of
[ogl](https://github.com/oframe/ogl). Hugo renders every page as ordinary
HTML, and that's what you get with JavaScript off. On a phone the prompt is
hidden and you tap the menus; without WebGL the game refuses to start and says
so.

One constraint shaped the code: a strict Content Security Policy with
`script-src 'self'` and no inline scripts. That rules out the usual move of
templating page data into an executable inline `<script>`. It does not rule
out a `<script>` element whose `type` is not a JavaScript MIME type: the HTML
parser keeps that as an inert data block, so it never executes and
`script-src` never applies to it. The page data rides in one of those, and the
terminal reads it back out of the DOM on boot. That means no inline hashes to
maintain, and no reason to reach for a nonce, which has to be fresh on every
response and a page built once as a file hands the same bytes to everyone.

The plain pages are still the fast path, and every one is a link away. The
terminal stays because I like it.

At the prompt, `help` lists the rest. The source is at
[matt-w-horn/seahorse-emoji](https://github.com/matt-w-horn/seahorse-emoji).
