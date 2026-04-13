// Shared GLSL noise / utility snippets.
//
// Each export is a raw GLSL function body (no `precision` or `void main`)
// meant to be interpolated into a larger fragment-shader template literal:
//
//   const FRAG = /* glsl */ `
//   precision highp float;
//   ${GLSL_HASH}
//   ${GLSL_NOISE}
//   ${GLSL_FBM_3}
//   void main() { … }
//   `;

/** Pseudo-random hash — maps a 2D point to a repeatable [0,1) value. */
export const GLSL_HASH = /* glsl */ `
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
`;

/** Smooth 2D value noise built on top of hash(). */
export const GLSL_NOISE = /* glsl */ `
float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}
`;

/** Fractal Brownian Motion — 3 octaves, scale 2.05. Used by dissolve shaders. */
export const GLSL_FBM_3 = /* glsl */ `
float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
        v += a * noise(p);
        p *= 2.05;
        a *= 0.5;
    }
    return v;
}
`;

/** Fractal Brownian Motion — 4 octaves, scale 2.02. Used by the background shader. */
export const GLSL_FBM_4 = /* glsl */ `
float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p *= 2.02;
        a *= 0.5;
    }
    return v;
}
`;

/** 4x4 Bayer dithering matrix — returns a threshold in [0, 1). */
export const GLSL_BAYER4 = /* glsl */ `
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
`;
