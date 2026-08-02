// The phosphor pipeline, on the GPU this time.
//
// The old version faked bloom by downsampling the finished 2D frame into a
// quarter-res canvas, fading it by half per frame and drawing it back with
// 'lighter'. That gave trails and glow in one trick, but the blur was whatever
// drawImage's downsample happened to do, and it cost two full-canvas draws per
// frame on the CPU.
//
// Here: the scene renders to a target, a bright-pass extracts the lit part into
// a quarter-res target, two separable blur passes widen it, and a final pass
// composites bloom over the scene and applies the CRT treatment (barrel
// distortion, vignette, scanlines, a little chromatic aberration at the edges).
//
// Persistence is a feedback target rather than a per-frame fade of the visible
// canvas, so trails decay at a rate independent of frame rate.

import { Renderer, Program, Mesh, RenderTarget, Triangle } from 'ogl';

const VERT = /* glsl */ `
  attribute vec2 uv;
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

// luminance threshold, so only the beam blooms and the background does not
const BRIGHT = /* glsl */ `
  precision highp float;
  uniform sampler2D tMap;
  uniform float uThreshold;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tMap, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.35, l), 1.0);
  }
`;

// one direction per pass; uDir carries the texel step, so the same program
// serves both by swapping the uniform
const BLUR = /* glsl */ `
  precision highp float;
  uniform sampler2D tMap;
  uniform vec2 uDir;
  varying vec2 vUv;
  void main() {
    // nine taps on a gaussian, folded to five using linear-filter midpoints
    vec3 sum = texture2D(tMap, vUv).rgb * 0.2270270270;
    sum += texture2D(tMap, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
    sum += texture2D(tMap, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
    sum += texture2D(tMap, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
    sum += texture2D(tMap, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
    gl_FragColor = vec4(sum, 1.0);
  }
`;

// scene + bloom + trails, then the monitor. uLight flips the compositing:
// additive glow disappears on a pale background, so light themes get an ink
// bleed that darkens instead.
const COMPOSITE = /* glsl */ `
  precision highp float;
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform sampler2D tTrail;
  uniform vec3 uBg;
  uniform float uLight;
  uniform float uTime;
  uniform float uWarp;
  uniform vec2 uRes;
  varying vec2 vUv;

  void main() {
    // barrel distortion, pushed further during the wave jump
    vec2 c = vUv - 0.5;
    float r2 = dot(c, c);
    vec2 uv = vUv + c * r2 * (0.10 + uWarp * 0.55);

    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(uBg, 1.0);
      return;
    }

    // chromatic aberration grows toward the edge, where a real tube misconverges
    float ca = (0.0009 + uWarp * 0.004) * r2 * 8.0;
    vec3 scene;
    scene.r = texture2D(tScene, uv + c * ca).r;
    scene.g = texture2D(tScene, uv).g;
    scene.b = texture2D(tScene, uv - c * ca).b;

    vec3 bloom = texture2D(tBloom, uv).rgb;
    vec3 trail = texture2D(tTrail, uv).rgb;

    vec3 lit = scene + bloom * 0.85 + trail * 0.55;
    vec3 col = mix(uBg + lit, uBg - lit * 0.55, uLight);

    // scanlines: half-strength rows, gentle enough not to strobe against thin
    // horizontal lines as they drift
    col *= 0.955 + 0.045 * sin(uv.y * uRes.y * 3.14159 + uTime * 0.5);
    // vignette
    col *= 1.0 - smoothstep(0.32, 0.86, length(c)) * mix(0.30, 0.10, uLight);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// the trail target eats the previous frame at a fixed rate per second, so
// persistence looks the same at 30fps and 144fps
const FEEDBACK = /* glsl */ `
  precision highp float;
  uniform sampler2D tPrev;
  uniform sampler2D tScene;
  uniform float uDecay;
  varying vec2 vUv;
  void main() {
    vec3 prev = texture2D(tPrev, vUv).rgb * uDecay;
    vec3 now = texture2D(tScene, vUv).rgb;
    gl_FragColor = vec4(max(prev, now * 0.75), 1.0);
  }
`;

export interface PostOpts { reduced: boolean; }

export interface Post {
  sceneTarget: RenderTarget;
  resize: (w: number, h: number, dpr: number) => void;
  run: (bg: [number, number, number], light: boolean, time: number, warp: number, dt: number) => void;
  dispose: () => void;
}

export function createPost(renderer: Renderer, opts: PostOpts): Post {
  const gl = renderer.gl;
  const geometry = new Triangle(gl);

  const opt = { depth: false, minFilter: gl.LINEAR, magFilter: gl.LINEAR };
  let scene = new RenderTarget(gl, { ...opt, depth: true, width: 2, height: 2 });
  let bright = new RenderTarget(gl, { ...opt, width: 2, height: 2 });
  let blur = new RenderTarget(gl, { ...opt, width: 2, height: 2 });
  let trailA = new RenderTarget(gl, { ...opt, width: 2, height: 2 });
  let trailB = new RenderTarget(gl, { ...opt, width: 2, height: 2 });

  const mk = (fragment: string, uniforms: Record<string, { value: unknown }>) =>
    new Mesh(gl, { geometry, program: new Program(gl, { vertex: VERT, fragment, uniforms, depthTest: false, depthWrite: false }) });

  const brightPass = mk(BRIGHT, { tMap: { value: null }, uThreshold: { value: 0.22 } });
  const blurPass = mk(BLUR, { tMap: { value: null }, uDir: { value: [0, 0] } });
  const feedbackPass = mk(FEEDBACK, { tPrev: { value: null }, tScene: { value: null }, uDecay: { value: 0.9 } });
  const compositePass = mk(COMPOSITE, {
    tScene: { value: null }, tBloom: { value: null }, tTrail: { value: null },
    uBg: { value: [0, 0, 0] }, uLight: { value: 0 },
    uTime: { value: 0 }, uWarp: { value: 0 }, uRes: { value: [1, 1] },
  });

  let bw = 2, bh = 2;

  function resize(w: number, h: number, dpr: number) {
    const fw = Math.max(2, Math.round(w * dpr));
    const fh = Math.max(2, Math.round(h * dpr));
    bw = Math.max(2, Math.round(fw / 4));
    bh = Math.max(2, Math.round(fh / 4));
    scene.setSize(fw, fh);
    bright.setSize(bw, bh);
    blur.setSize(bw, bh);
    trailA.setSize(bw, bh);
    trailB.setSize(bw, bh);
    (compositePass.program.uniforms.uRes.value as number[])[0] = fw;
    (compositePass.program.uniforms.uRes.value as number[])[1] = fh;
  }

  function draw(mesh: Mesh, target: RenderTarget | null) {
    renderer.render({ scene: mesh, target: target ?? undefined, clear: true });
  }

  function run(bg: [number, number, number], light: boolean, time: number, warp: number, dt: number) {
    // bright-pass into quarter res, then blur it in both directions
    brightPass.program.uniforms.tMap.value = scene.texture;
    draw(brightPass, bright);

    blurPass.program.uniforms.tMap.value = bright.texture;
    blurPass.program.uniforms.uDir.value = [1 / bw, 0];
    draw(blurPass, blur);

    blurPass.program.uniforms.tMap.value = blur.texture;
    blurPass.program.uniforms.uDir.value = [0, 1 / bh];
    draw(blurPass, bright);

    if (opts.reduced) {
      // bloom without trails: reduced motion should not smear
      compositePass.program.uniforms.tTrail.value = bright.texture;
    } else {
      // decay per second, not per frame, so trails do not shorten on a fast
      // machine and lengthen on a slow one
      feedbackPass.program.uniforms.uDecay.value = Math.pow(0.06, Math.min(dt, 0.1));
      feedbackPass.program.uniforms.tPrev.value = trailA.texture;
      feedbackPass.program.uniforms.tScene.value = bright.texture;
      draw(feedbackPass, trailB);
      const swap = trailA; trailA = trailB; trailB = swap;
      compositePass.program.uniforms.tTrail.value = trailA.texture;
    }

    const u = compositePass.program.uniforms;
    u.tScene.value = scene.texture;
    u.tBloom.value = bright.texture;
    u.uBg.value = bg;
    u.uLight.value = light ? 1 : 0;
    u.uTime.value = time;
    u.uWarp.value = warp;
    draw(compositePass, null);
  }

  function dispose() {
    // the context is going away with the canvas, but the targets hold real
    // GPU memory and a re-entered game builds new ones
    for (const t of [scene, bright, blur, trailA, trailB]) {
      gl.deleteFramebuffer(t.buffer);
    }
  }

  return {
    get sceneTarget() { return scene; },
    resize, run, dispose,
  } as Post;
}
