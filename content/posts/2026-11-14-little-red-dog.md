+++
title = "Little Red Dog by the Sea: building a pixel art TV screensaver with Claude"
date = 2026-11-14
author = "Matt Horn"
+++

![One day on the beach, sped up across dawn, daylight, dusk, and night](/img/little-red-dog/hero_day.gif)

*One day on the beach, sped up across dawn, daylight, dusk, and night.*

This week, I learned I could [connect to my Google TV using a coding agent](https://github.com/Gathin23/cleanyourtv), and took the opportunity to start removing some bloatware. I got curious when I saw a few examples of screensavers with [pixel art koi fish](https://github.com/Gathin23/cleanyourtv/tree/main/addons/koi-pond) on GitHub. A few days later, I finished a [pixel art screensaver of my dog](https://github.com/matt-w-horn/little-red-dog-by-the-sea) on a Northern California beach, complete with tides, migrating wildflowers, holidays, and hourly light shifts. Claude wrote all of the code and image files.

Gemini's image generation model ([Nano Banana 2](https://ai.google.dev/gemini-api/docs/image-generation), `gemini-nano-banana-2.1`) cleaned clutter out of my phone photos and sketched early layouts. From there, Claude Fable 5.2 wrote the [Java Android TV app](https://github.com/matt-w-horn/little-red-dog-by-the-sea/tree/main/app) (zero network access, zero Android permissions) alongside the [Python scripts](https://github.com/matt-w-horn/little-red-dog-by-the-sea/tree/main/tools) that generate every shipped pixel under [`art/`](https://github.com/matt-w-horn/little-red-dog-by-the-sea/tree/main/art).

## Color slots, baked dithering, and Python-to-Java parity

Most of the design grew out of two hard constraints: a fixed `480x270` canvas scaled `8x` to 4K with nearest-neighbor filtering, and an indexed palette model. Pixels don't store literal RGB colors; they store semantic color slots, like paint by numbers. Separating geometry from [palette tables](https://github.com/matt-w-horn/little-red-dog-by-the-sea/tree/main/art/palettes) lets `12` monthly calendars and `6` lighting states (dawn, day, dusk, cloudy, rain, and night) share one set of art files with zero redraws.

Early versions showed harsh horizontal bands across the sky and sea. For the gradients, I used baked [Floyd-Steinberg dithering](https://en.wikipedia.org/wiki/Floyd%E2%80%93Steinberg_dithering) ([`tools/scene_dither.py`](https://github.com/matt-w-horn/little-red-dog-by-the-sea/blob/main/tools/scene_dither.py)) across `48` sky tones, `16` sea tones, and `16` sand tones. Computing it once stops gradients from shimmering on every change (though a little shimmer might be nice in the ocean).

Claude was iterating on this first in Java, where every tweak waited behind a full Gradle build and ADB deploy. To speed up the build, test, and review loop, I moved most of the art pipeline to [Python](https://github.com/matt-w-horn/little-red-dog-by-the-sea/blob/main/tools/scene.py), then ported it back to [Java](https://github.com/matt-w-horn/little-red-dog-by-the-sea/blob/main/app/src/main/java/io/matthorn/littlereddog/Scene.java) for the app. A frame-hash manifest ([`art/reference/manifest.json`](https://github.com/matt-w-horn/little-red-dog-by-the-sea/blob/main/art/reference/manifest.json)) runs in [unit tests](https://github.com/matt-w-horn/little-red-dog-by-the-sea/blob/main/app/src/test/java/io/matthorn/littlereddog/SceneReferenceTest.java) so Java can't drift from Python by a single pixel.

![Scene evolution across working history: early flat bands, baked Floyd-Steinberg dithering, and shipped scene](/img/little-red-dog/scene_progression_horizontal.png)

*Scene evolution across the working history: early banded gradients, baked `48`/`16`/`16`-tone Floyd-Steinberg dithering, and the shipped beach with doghouse, surf ribbons, and seasonal plants.*

## The only evidence is visual

Verification was a challenge. The art kept regressing, especially the `40`-pixel-tall dog sprites across six poses. Small changes to a collar or paw would turn into big mistakes, garbled images, and a litany of errors.

Early on, I set a rule: prose confidence doesn't count, and the only evidence is visual.

1. When generating new pixel art, Claude has to load a cleaned reference photo first.
2. When modifying existing art, Claude has to load the current sprite first.
3. After each edit, Claude overlays the sprite at `50%` opacity over the photo. Finished sheets go to a reviewer subagent to describe aloud what it sees, then approved elements lock so they won't change.

Phone snapshots came with couches, awkward angles, and a patterned wrap on his hind leg. Gemini first isolated each pose onto a blue key background, then traced a flat-region study before we mapped silhouettes onto the grid.

![Side-pose reference pipeline from phone crop to Gemini cleanup, flat study, 3-part sprite, and 50% opacity overlay](/img/little-red-dog/ref_pipeline_side.png)

*Reference pipeline for the sleeping side pose: cropped phone shot, Gemini cleanup removing the leg wrap, flat-region study, three-part [`dog_side`](https://github.com/matt-w-horn/little-red-dog-by-the-sea/blob/main/art/dog_side.png) sprite, and `50%` opacity overlay check.*

## Why nine subagents approved a two-tailed dog

Scaling judgment is hard, especially for ambiguous tasks like "represent my dog using pixel art". At `40` pixels tall, pixel art is pretty far from a photo, so what does it even mean for a dog to be properly represented?

At one point, I came back to a session that had garbled two sleeping poses (`side` and `curl`). On `side`, the model gave him two separate tails: one straight tail sticking left, plus the curled tail tucked underneath. Nine Fable subagents looked at those candidates, and the ninth approved both. Subsequent redraws went further off the rails with stiff `45`-degree stilt legs, a pinched neck, and a side-profile head grafted onto `curl`, before I rolled back to the earlier baseline.

![Sprite regressions across earlier commits: baseline, 9-subagent two-tailed failure, redraw regressions, and final shipped](/img/little-red-dog/sprite_regression_strip.png)

*Pre-squash regression progression for `side` and `curl`: approved baseline, the two-tailed `side` edit passed by nine subagents, subsequent stilt-leg and head-graft redraw failures, and the final shipped sprites.*

Looking into how the harness and vision encoder processed images surfaced two mechanical failure modes:

1. **Patch-vector encoding and information density:** Vision models don't inspect a pixel grid directly; they divide an image into fixed patches and project each patch into a vector embedding, after the harness first downscales any image over roughly `2,000` pixels on a side. That makes review sheets an information-density problem, not just a resolution problem. Packing multiple poses and lighting states onto one contact sheet crams an entire `40`-pixel sprite into a handful of patch vectors, compressing two-pixel neck seams and extra tails into the same representation before the model evaluates them.
2. **Perspective hallucination:** Overhead couch photos of a curled dog hid his lower face and foreshortened his spine. Asking a code model to reconstruct missing camera angles on a pixel grid broke proportions every time.

Once I saw a pattern, we'd turn it into a guideline for that class of error. We locked standing and sleeping silhouettes to orthographic side-view ratios matching his build (`1:1` shoulder-to-rump torso square, legs at `50%` of shoulder height, head at `40%`), then added a shading rule: "decide where the sun is before you place a single shadow".

When text rules still fell short on `curl`, adding another camera angle solved it. Gemini re-photographed the overhead shot from a low eye-level angle. Python area-averaged that cutout onto the pixel grid via [`Image.Resampling.BOX`](https://pillow.readthedocs.io/en/stable/reference/Image.html#PIL.Image.Resampling.BOX), and a local alignment script flagged outline mismatches in `50%` magenta beside magnified quadrant crops.

![Curled pose pipeline: overhead photo, Gemini low-angle re-photo, Python BOX grid reduction, magenta outline check, and shipped dog_curl sprite](/img/little-red-dog/ref_pipeline_curl.png)

*Fixing camera foreshortening on `curl`: overhead snapshot, Gemini low-angle re-photography, Python `BOX` reduction, `50%` magenta outline diff, and the shipped [`dog_curl`](https://github.com/matt-w-horn/little-red-dog-by-the-sea/blob/main/art/dog_curl.png) sprite.*

## Harmonizing six poses under one sun (PR #6)

We also made some minor adjustments to the dog sprites in [PR #6](https://github.com/matt-w-horn/little-red-dog-by-the-sea/pull/6). Once all six silhouettes held together, they still didn't quite look like the same dog under the same sky. Commit [`f273347`](https://github.com/matt-w-horn/little-red-dog-by-the-sea/commit/f273347ea20907c50d62f8429985d62a3dba182c) restored the [standing dog's](https://github.com/matt-w-horn/little-red-dog-by-the-sea/blob/main/art/dog.png) original front half while keeping its newer head, collar, haunch, and tail. Plotting all six sprites in false color by semantic role then explained why the rest felt flatter: `stand` carried broad yellow `COAT_TOP` highlight patches across its back and shoulder, while the other five poses only had a one-pixel rim.

![False-color semantic role plot across all six sprites comparing broad COAT_TOP patches on stand against one-pixel rims on the other five poses](/img/little-red-dog/pr6_roles_falsecolour.png)

*Semantic palette roles in false color (`COAT_TOP` yellow, `COAT_REAR` pink, `COAT_FRONT` green, `COAT_UNDER` dark brown, `COAT_FAR` navy, `WHITE` white).*

Copying `stand`'s highlight strip literally looked wrong on curled or prone shapes, so commit [`4c23383`](https://github.com/matt-w-horn/little-red-dog-by-the-sea/commit/4c2338315539e9647103663f5479172f3b16a69c) relit each pose from its own geometry. [`belly`](https://github.com/matt-w-horn/little-red-dog-by-the-sea/blob/main/art/dog_belly.png) and [`side`](https://github.com/matt-w-horn/little-red-dog-by-the-sea/blob/main/art/dog_side.png) scale `COAT_TOP` depth by how steeply the back faces up; upright [`sit`](https://github.com/matt-w-horn/little-red-dog-by-the-sea/blob/main/art/dog_sit.png) and [`sphinx`](https://github.com/matt-w-horn/little-red-dog-by-the-sea/blob/main/art/dog_sphinx.png) use an ellipsoid-mass script lit by a high left sun calibrated on `stand`. On [`curl`](https://github.com/matt-w-horn/little-red-dog-by-the-sea/blob/main/art/dog_curl.png), twelve refinement steps walked the back closer to the cutout contour, tilted the face down a pixel, widened a cream muzzle bridge above the nose, moved the breathing rect in [`tools/poses/curl.json`](https://github.com/matt-w-horn/little-red-dog-by-the-sea/blob/main/tools/poses/curl.json) to row `8`, and re-exported [`art/reference/manifest.json`](https://github.com/matt-w-horn/little-red-dog-by-the-sea/blob/main/art/reference/manifest.json) ([`743d8e3`](https://github.com/matt-w-horn/little-red-dog-by-the-sea/commit/743d8e3694633b46c4d6de76ce84271b8b099bd2) updated the GIFs).

![Final step 12 on curl comparing 10x old and new face beside the close-up photo and four beach lighting states](/img/little-red-dog/pr6_curl_bridge_final.png)

*Final `curl` pass at `10x` beside the close-up snout photo and dawn, day, dusk, and night renders.*

## Tuning for a 4K living-room TV

Some problems were hard to spot without a large screen. Early night scenes left the stars and clock too bright. They also kept beach sand at `52%` of daytime brightness, so the shoreline read like snow. Because I wanted this running 24/7, I spent a few hours calibrating brightness across day and night so it wouldn't pollute the house with blue light. Dropping [night sand](https://github.com/matt-w-horn/little-red-dog-by-the-sea/blob/main/art/palettes/night.json) to `34%` brightness (cooled `+15%` blue to offset the evening warmth filter) and dimming a warm translucent clock after `21:30` settled the room.

![Zoomed horizon dithering comparison and early versus tuned night brightness calibration](/img/little-red-dog/dithering_and_night_strip.png)

*Top: zoomed horizon gradients before and after baked `48`/`16`/`16` Floyd-Steinberg dithering ([`tools/scene_dither.py`](https://github.com/matt-w-horn/little-red-dog-by-the-sea/blob/main/tools/scene_dither.py)). Bottom: early `0.52x` night glare vs. tuned `0.34x` blue-cooled sand and dimmed clock ([`art/palettes/night.json`](https://github.com/matt-w-horn/little-red-dog-by-the-sea/blob/main/art/palettes/night.json)).*

Along the way, there was a barely perceptible shudder on the shooting star crossing the sky. Beach art ticks at `8 fps` (`125 ms`), while the shooting star interpolates on every `60 Hz` panel refresh (`16.7 ms` vsync). Claude helped me profile the app with [`simpleperf`](https://developer.android.com/ndk/guides/simpleperf) over ADB. Drawing one `480x270` frame on the UI thread took `22 ms` despite using only `18.8%` of one of the TV's four cores, so every `8 Hz` art tick missed a vsync deadline and dropped one frame in eight.

I suggested Claude try a multithreaded pipeline that renders two ticks ahead. Offloading rendering onto a `beach-draw` producer inside a four-slot [`FrameRing`](https://github.com/matt-w-horn/little-red-dog-by-the-sea/blob/main/app/src/main/java/io/matthorn/littlereddog/FrameRing.java) buffer, paired with `256`-entry [`Dim`](https://github.com/matt-w-horn/little-red-dog-by-the-sea/blob/main/app/src/main/java/io/matthorn/littlereddog/Dim.java) lookup tables on the `beach` display thread in [`SceneView`](https://github.com/matt-w-horn/little-red-dog-by-the-sea/blob/main/app/src/main/java/io/matthorn/littlereddog/SceneView.java), stopped the stutter (`0` ticks dropped, `0.4 ms` average callback delay).

## Context compaction and catastrophic forgetting

A lot of the work was simply managing the model. Fable 5.2 is a beast, and it'll burn through tokens quickly if you don't pay attention. Loading all `63` reference files at startup eats roughly `220,000` tokens (`~3,500` tokens per picture) before any code gets written. Over a 24-hour sprite session, context compacted `7` times, including `3` automatic [context compactions](https://platform.claude.com/docs/en/build-with-claude/context-windows) near `967,000` tokens.

Every compaction caused [catastrophic forgetting](https://en.wikipedia.org/wiki/Catastrophic_interference) on subsequent art edits until I saw why. Compaction keeps a short text summary while dropping fine geometry rules and flushing image attachments out of the active window, leaving the model to edit pixels from prose summaries alone. Re-loading locked sprites, active rules, and the two or three reference photos for the pose in progress right after every compaction turned out to be essential. It doesn't happen automatically.

Near the end, I ran `/code-review` passes to deduplicate shared helpers, trim the dead foam fallback, tighten [Python](https://github.com/matt-w-horn/little-red-dog-by-the-sea/blob/main/tools/scene.py) and [Java](https://github.com/matt-w-horn/little-red-dog-by-the-sea/blob/main/app/src/main/java/io/matthorn/littlereddog/Scene.java) parity checks, and bring render time down from `22 ms` to `14.4 ms`.

![Updated six poses, surprise trigger, and night transition from PR #6](/img/little-red-dog/hero_poses.gif)

*All six harmonized poses from PR #6, the animated surprise trigger, and the transition into night lighting.*

I gave the screensaver my dog's nickname, ["Little Red Dog"](https://github.com/matt-w-horn/little-red-dog-by-the-sea). More to come.
