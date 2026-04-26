import { GLSL_HASH, GLSL_NOISE, GLSL_FBM_4, GLSL_BAYER4 } from "./utils/glslNoise";

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
// 0.0 = default purple/amber palette (menu + combat).
// 1.0 = shop palette (deep navy / teal / seafoam / kelp).
// Tweened on the JS side so the background recolors smoothly when the
// player enters / leaves the shop.
uniform float uShopMode;
// 0.0 = normal enemy.  1.0 = boss round.
// Tweened on the JS side for a smooth palette shift into danger.
uniform float uBossMode;
// Per-pack-type palette tweens. Only one is non-zero at a time
// (server enforces mutual exclusivity on the pickers), but each is
// tweened independently so transitions ease cleanly.
//   uRunePackMode → dark/light greens   (Rune Pack picker)
//   uCodexMode    → dark/light blues    (Codex Pack picker)
//   uAuguryMode   → magenta/dark purple (Augury Pack picker)
// All three are mixed in AFTER uShopMode so the pack palette overrides
// the shop's ocean-teal while a picker is open, and BEFORE uBossMode
// so combat danger always wins on boss rounds.
uniform float uRunePackMode;
uniform float uCodexMode;
uniform float uAuguryMode;

// --- Hash & noise ---

${GLSL_HASH}
${GLSL_NOISE}
${GLSL_FBM_4}

// Soft radial glow falloff for the orbs.
float orbGlow(vec2 p, vec2 center, float radius) {
    return exp(-length(p - center) / radius);
}

// ----- Lightning helpers (boss rounds only) -----
// Each bolt is a vertical jagged line. We sample noise along the y axis
// to displace x, then measure distance from the displaced center to get
// a sharp bright core with soft falloff.

float lightningBolt(vec2 p, float seed, float t) {
    // Bolt anchored at a seeded x position, running top to bottom.
    float boltX = (hash(vec2(seed, 0.0)) - 0.5) * 1.4;
    // Walk down the bolt, displacing x with noise for a jagged shape.
    float jag = 0.0;
    float freq = 6.0;
    float amp = 0.12;
    for (int i = 0; i < 3; i++) {
        jag += amp * (noise(vec2(p.y * freq + seed * 13.7, seed * 7.3)) - 0.5);
        freq *= 2.2;
        amp *= 0.5;
    }
    float dist = abs(p.x - boltX - jag);
    // Sharp bright core with soft glow halo.
    float core = exp(-dist * 80.0);
    float glow = exp(-dist * 12.0) * 0.4;
    // Fade out at top and bottom edges.
    float yFade = smoothstep(-0.6, -0.2, p.y) * smoothstep(0.6, 0.2, p.y);
    return (core + glow) * yFade;
}

// Returns the combined lightning intensity for the current frame.
// Bolts fire in bursts: a bright flash that decays over ~0.15s,
// repeating every 2-4 seconds with a randomized period.
float bossLightning(vec2 p, float t) {
    float total = 0.0;
    // Two independent bolt channels with different periods.
    for (int i = 0; i < 2; i++) {
        float period = 6.0 + float(i) * 4.0;
        float seed = floor(t / period) + float(i) * 100.0;
        float phase = fract(t / period);
        // Bolt visible in the first 15% of the cycle, then dark.
        float flash = 1.0 - smoothstep(0.0, 0.15, phase);
        // Double-strike flicker: a second weaker flash shortly after.
        flash += (1.0 - smoothstep(0.08, 0.2, phase)) * 0.3
               * step(0.06, phase);
        if (flash > 0.01) {
            total += lightningBolt(p, seed, t) * flash;
            // Branch bolt — offset from the main bolt.
            total += lightningBolt(p + vec2(0.08, 0.15), seed + 50.0, t)
                   * flash * 0.35;
        }
    }
    return total;
}

${GLSL_BAYER4}

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
    // Default (combat) palette — warm purples/amber/violet with teal accent.
    vec3 deepPurple = vec3(0.05, 0.03, 0.10);
    vec3 midPurple  = vec3(0.18, 0.08, 0.28);
    vec3 amber      = vec3(0.95, 0.55, 0.18);
    vec3 violet     = vec3(0.55, 0.20, 0.85);
    vec3 teal       = vec3(0.10, 0.60, 0.70);
    vec3 ember      = vec3(0.40, 0.10, 0.05);

    // Shop palette — deep ocean blues and kelp greens. Each slot keeps the
    // same role in the color accumulation below so the overall composition
    // (fog motes / orb glow / vignette) stays visually identical; only the
    // hues shift. mix() with uShopMode gives a smooth transition when the
    // player walks into / out of the shop.
    vec3 deepNavy   = vec3(0.02, 0.06, 0.12);
    vec3 midTeal    = vec3(0.05, 0.18, 0.28);
    vec3 seafoam    = vec3(0.30, 0.80, 0.75);
    vec3 oceanBlue  = vec3(0.15, 0.40, 0.85);
    vec3 kelp       = vec3(0.15, 0.65, 0.45);
    vec3 abyss      = vec3(0.05, 0.15, 0.22);

    // Boss palette — muted reds with hints of warm orange.
    vec3 deepCrimson  = vec3(0.10, 0.03, 0.04);
    vec3 midCrimson   = vec3(0.25, 0.06, 0.08);
    vec3 bloodOrange  = vec3(0.85, 0.38, 0.12);
    vec3 crimson      = vec3(0.72, 0.15, 0.15);
    vec3 darkRuby     = vec3(0.48, 0.12, 0.12);
    vec3 bloodEmber   = vec3(0.28, 0.07, 0.04);

    // Rune Pack picker palette — dark/light greens. Forest base with
    // bright lime + emerald midtones; reads as natural / mossy /
    // herbal magic.
    vec3 deepForest    = vec3(0.03, 0.10, 0.04);
    vec3 midMoss       = vec3(0.08, 0.25, 0.12);
    vec3 limeGlow      = vec3(0.65, 0.95, 0.55);
    vec3 emeraldShine  = vec3(0.20, 0.75, 0.40);
    vec3 jadeWarm      = vec3(0.45, 0.85, 0.55);
    vec3 darkPine      = vec3(0.05, 0.15, 0.07);

    // Codex Pack picker palette — dark/light blues. Deep ocean-night
    // base with bright sky highlights; reads as "tome of stars / clear
    // sky knowledge" to distinguish from the shop's teal-leaning sea.
    vec3 deepOcean     = vec3(0.02, 0.05, 0.15);
    vec3 midCobalt     = vec3(0.06, 0.15, 0.40);
    vec3 skyGlow       = vec3(0.55, 0.78, 0.98);
    vec3 electricBlue  = vec3(0.20, 0.50, 0.95);
    vec3 aquaShine     = vec3(0.30, 0.70, 0.95);
    vec3 nightAbyss    = vec3(0.04, 0.08, 0.20);

    // Augury Pack picker palette — magentas / dark purples. Mystical
    // arcane wash that reads as "tarot reveal / fate divination".
    vec3 deepVoid      = vec3(0.06, 0.02, 0.10);
    vec3 midShadow     = vec3(0.20, 0.05, 0.32);
    vec3 magentaGlow   = vec3(0.92, 0.45, 0.95);
    vec3 royalPurple   = vec3(0.55, 0.18, 0.85);
    vec3 pinkShine     = vec3(0.95, 0.40, 0.85);
    vec3 voidPurple    = vec3(0.10, 0.02, 0.18);

    deepPurple = mix(deepPurple, deepNavy,  uShopMode);
    midPurple  = mix(midPurple,  midTeal,   uShopMode);
    amber      = mix(amber,      seafoam,   uShopMode);
    violet     = mix(violet,     oceanBlue, uShopMode);
    teal       = mix(teal,       kelp,      uShopMode);
    ember      = mix(ember,      abyss,     uShopMode);

    // Pack-picker mixes applied AFTER shop so each pack palette
    // overrides the shop's ocean-teal while its picker is open. Order
    // doesn't matter visually since only one of these is non-zero at
    // a time (server-enforced picker exclusivity), but listing them
    // bottom-up Rune → Codex → Augury keeps the file shape consistent.
    deepPurple = mix(deepPurple, deepForest,    uRunePackMode);
    midPurple  = mix(midPurple,  midMoss,       uRunePackMode);
    amber      = mix(amber,      limeGlow,      uRunePackMode);
    violet     = mix(violet,     emeraldShine,  uRunePackMode);
    teal       = mix(teal,       jadeWarm,      uRunePackMode);
    ember      = mix(ember,      darkPine,      uRunePackMode);

    deepPurple = mix(deepPurple, deepOcean,     uCodexMode);
    midPurple  = mix(midPurple,  midCobalt,     uCodexMode);
    amber      = mix(amber,      skyGlow,       uCodexMode);
    violet     = mix(violet,     electricBlue,  uCodexMode);
    teal       = mix(teal,       aquaShine,     uCodexMode);
    ember      = mix(ember,      nightAbyss,    uCodexMode);

    deepPurple = mix(deepPurple, deepVoid,      uAuguryMode);
    midPurple  = mix(midPurple,  midShadow,     uAuguryMode);
    amber      = mix(amber,      magentaGlow,   uAuguryMode);
    violet     = mix(violet,     royalPurple,   uAuguryMode);
    teal       = mix(teal,       pinkShine,     uAuguryMode);
    ember      = mix(ember,      voidPurple,    uAuguryMode);

    deepPurple = mix(deepPurple, deepCrimson,  uBossMode);
    midPurple  = mix(midPurple,  midCrimson,   uBossMode);
    amber      = mix(amber,      bloodOrange,  uBossMode);
    violet     = mix(violet,     crimson,      uBossMode);
    teal       = mix(teal,       darkRuby,     uBossMode);
    ember      = mix(ember,      bloodEmber,   uBossMode);

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

    // ----- Boss lightning -----
    // Periodic lightning strikes that flash across the background during
    // boss rounds. Intensity scales with uBossMode so they tween in/out.
    if (uBossMode > 0.01) {
        float lightning = bossLightning(p, uTime);
        vec3 boltColor = vec3(0.95, 0.70, 0.50);
        color += boltColor * lightning * uBossMode * 0.35;
        // Brief ambient flash that illuminates the whole scene on strike.
        float ambientFlash = lightning * 0.04;
        color += vec3(ambientFlash) * uBossMode;
    }

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
