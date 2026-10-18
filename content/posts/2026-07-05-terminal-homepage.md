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
root](/). Type `play` there for an asteroids game in wireframe 3D.

Hugo renders every page as ordinary HTML, and that's what you get with
JavaScript off. On a phone the prompt is hidden and you tap the menus; without
WebGL the game falls back cleanly with a short notice.

The terminal is about 1,100 lines of TypeScript with no framework and no
runtime dependencies; the game adds about another 2,100 on top of
[ogl](https://github.com/oframe/ogl).

I wrote the code under one constraint: a strict Content Security Policy allowing
script only from the site's own origin (`script-src 'self'`) and forbidding
inline scripts. That ruled out templating the page data into an executable
inline `<script>`. A `<script>` element whose `type` is not a JavaScript MIME
type is still allowed: the HTML parser keeps it as an inert data block, so it
never executes and `script-src` never applies to it. I put the page data in one
of those, and the terminal reads it back out of the DOM on boot. With the data
block, there are no inline script hashes to maintain and no per-response nonces
(which a static file host serving identical bytes to every visitor cannot mint
anyway).

The plain pages are still the fast path, and every one is a link away. The
terminal stays because it was fun to build.

At the prompt, `help` lists the rest. The source is at
[matt-w-horn/seahorse-emoji](https://github.com/matt-w-horn/seahorse-emoji).
