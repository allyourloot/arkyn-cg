// Fragment shader for the medieval-magical animated background.
//
// Look: deep purple/navy base swirling with domain-warped FBM fog (gives the
// flowing arcane-mist motion), three orbiting glowing orbs in amber/violet/teal
// drifting on independent Lissajous-like paths, a pulsing amber candle glow at
// screen center, and a soft vignette focusing attention on the play area.
export const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform vec2 uResolution;
uniform float uTime;

// --- Hash & noise ---

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

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

// Fractal Brownian Motion — sums octaves of value noise for cloud-like fog.
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

// Soft radial glow falloff for the orbs.
float orbGlow(vec2 p, vec2 center, float radius) {
    return exp(-length(p - center) / radius);
}

// 4x4 Bayer matrix — used for ordered dithering. Produces the classic
// crunchy 8-bit color banding pattern instead of smooth gradients.
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
    // Aspect-corrected coordinates centered on (0,0).
    vec2 p = (gl_FragCoord.xy - 0.5 * uResolution.xy) / min(uResolution.x, uResolution.y);
    // Global time scale — lower = slower, more contemplative drift.
    float t = uTime * 0.5;

    // ----- Domain-warped FBM fog -----
    // Sampling fbm at a position that is itself displaced by another fbm
    // produces flowing, swirling, magical motion (Inigo Quilez's domain warp).
    vec2 q = vec2(
        fbm(p * 2.0 + vec2(t * 0.06, 0.0)),
        fbm(p * 2.0 + vec2(5.2, t * 0.05 + 1.3))
    );
    float fog = fbm(p * 2.5 + 3.5 * q);

    // ----- Palette -----
    vec3 deepPurple = vec3(0.05, 0.03, 0.10);
    vec3 midPurple  = vec3(0.18, 0.08, 0.28);
    vec3 amber      = vec3(0.95, 0.55, 0.18);
    vec3 violet     = vec3(0.55, 0.20, 0.85);
    vec3 teal       = vec3(0.10, 0.60, 0.70);
    vec3 ember      = vec3(0.40, 0.10, 0.05);

    // Base atmospheric color modulated by fog density.
    vec3 color = mix(deepPurple, midPurple, fog);

    // Subtle violet tint where the warp field deviates strongly — gives the
    // swirls a faint chromatic edge as they move.
    color += violet * length(q - 0.5) * 0.18;

    // Dense fog regions glow amber so they read as drifting motes of light.
    float mote = pow(fog, 4.0);
    color += amber * mote * 0.50;

    // ----- Orbiting magical orbs -----
    // Three orbs drift along independent Lissajous-style paths and breathe in
    // size with low-frequency sin pulses.
    vec2 orb1Pos = vec2(sin(t * 0.18) * 0.55, cos(t * 0.23) * 0.32);
    float orb1 = orbGlow(p, orb1Pos, 0.20 + 0.025 * sin(t * 0.7));
    color += amber * orb1 * 0.55;

    vec2 orb2Pos = vec2(cos(t * 0.15 + 2.0) * 0.50, sin(t * 0.21 + 1.0) * 0.28);
    float orb2 = orbGlow(p, orb2Pos, 0.16 + 0.020 * sin(t * 0.5 + 1.0));
    color += violet * orb2 * 0.50;

    vec2 orb3Pos = vec2(sin(t * 0.13 + 4.0) * 0.45, cos(t * 0.19 + 3.0) * 0.36);
    float orb3 = orbGlow(p, orb3Pos, 0.14 + 0.020 * sin(t * 0.6 + 2.0));
    color += teal * orb3 * 0.32;

    // ----- Pulsing candle glow at center -----
    float distFromCenter = length(p);
    float centerGlow = exp(-distFromCenter * 1.6);
    float pulse = 0.85 + 0.15 * sin(t * 0.8);
    color += amber * centerGlow * 0.30 * pulse;

    // Faint ember undertone in the thinner fog regions.
    color += ember * (1.0 - fog) * 0.06;

    // Vignette to push focus toward the play area.
    float vig = 1.0 - smoothstep(0.5, 1.4, distFromCenter);
    color *= vig;

    // Slight gamma lift for richer midtones.
    color = pow(color, vec3(0.92));

    // ----- Texture overlay -----
    // Operates in pixel-space (gl_FragCoord) so the grain and dither snap
    // to the chunky upscaled pixel grid.
    vec2 px = gl_FragCoord.xy;

    // Static grain — per-pixel hash with no time term, so it stays locked
    // in place like a paper texture instead of crawling.
    float grain = hash(px) - 0.5;
    color += grain * 0.045;

    // Ordered dithering — quantize each channel to a small set of levels
    // using a Bayer matrix as the threshold. Smooth gradients become bands
    // of dotted pixels for a subtle 8-bit texture.
    float levels = 24.0;
    vec3 dithered = floor(color * levels + bayer4(px)) / levels;
    color = mix(color, dithered, 0.30);

    gl_FragColor = vec4(color, 1.0);
}
`;

export const VERTEX_SHADER = /* glsl */ `
attribute vec2 aPosition;
void main() {
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;
