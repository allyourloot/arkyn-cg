// Fragment shader for the global UI grain overlay.
//
// Renders a chunky-pixel noise pattern (per-pixel hash + Bayer dithering)
// centered around mid-gray (0.5). With `mix-blend-mode: soft-light` on
// the canvas in CSS, gray=0.5 reads as a no-op while brighter / darker
// pixels gently lift / darken whatever's underneath — adding subtle
// graininess + pixel-art texture across the entire UI without obscuring
// any of it. The grain is static (no `uTime` term) so it locks in place
// like a paper texture instead of crawling like film grain.
export const FRAGMENT_SHADER = /* glsl */ `
precision mediump float;

uniform vec2 uResolution;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// 4x4 Bayer matrix — same threshold pattern the BackgroundShader uses
// for its dither pass, just exposed at a slightly different weight here.
float bayer4(vec2 pos) {
    int x = int(mod(pos.x, 4.0));
    int y = int(mod(pos.y, 4.0));
    int idx = x + y * 4;
    if (idx == 0)  return  0.0 / 16.0;
    if (idx == 1)  return  8.0 / 16.0;
    if (idx == 2)  return  2.0 / 16.0;
    if (idx == 3)  return 10.0 / 16.0;
    if (idx == 4)  return 12.0 / 16.0;
    if (idx == 5)  return  4.0 / 16.0;
    if (idx == 6)  return 14.0 / 16.0;
    if (idx == 7)  return  6.0 / 16.0;
    if (idx == 8)  return  3.0 / 16.0;
    if (idx == 9)  return 11.0 / 16.0;
    if (idx == 10) return  1.0 / 16.0;
    if (idx == 11) return  9.0 / 16.0;
    if (idx == 12) return 15.0 / 16.0;
    if (idx == 13) return  7.0 / 16.0;
    if (idx == 14) return 13.0 / 16.0;
    return 5.0 / 16.0;
}

void main() {
    vec2 px = gl_FragCoord.xy;

    // Static per-pixel grain — locked to the chunky upscaled pixel grid.
    float grain = hash(px) - 0.5;

    // Bayer 4x4 ordered dither — adds a subtle high-frequency repeating
    // texture so flat regions still get a tiny bit of break-up.
    float dither = bayer4(px) - 0.5;

    // Combine, biased toward the random grain. Output a gray oscillating
    // around 0.5 (the no-op midpoint for soft-light blending). The
    // multipliers are kept low so the grain stays a whisper across the
    // UI; tune via these and the canvas opacity in OverlayShader.module.css.
    float intensity = grain * 0.32 + dither * 0.10;
    float gray = 0.5 + intensity;

    gl_FragColor = vec4(gray, gray, gray, 1.0);
}
`;

export const VERTEX_SHADER = /* glsl */ `
attribute vec2 aPosition;
void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;
