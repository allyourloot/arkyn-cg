import { GLSL_HASH, GLSL_NOISE, GLSL_FBM_3 } from "./utils/glslNoise";

// Fragment shader for the per-rune dissolve effect.
//
// Composites the rune over its rarity backdrop, then progressively erases
// pixels whose noise value is below an animated threshold. Pixels just above
// the threshold get a glowing edge tinted by the spell's element color, so
// the rune appears to burn away from the inside out.
export const DISSOLVE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform sampler2D uBaseTex;
uniform sampler2D uRuneTex;
uniform float uThreshold;   // 0..1 dissolve progress
uniform vec3 uEdgeColor;    // glow color (spell element)

${GLSL_HASH}
${GLSL_NOISE}
${GLSL_FBM_3}

void main() {
    // Sample backdrop and rune; rune is the foreground, base shows through holes.
    vec4 baseCol = texture2D(uBaseTex, vUv);
    vec4 runeCol = texture2D(uRuneTex, vUv);
    vec4 col = mix(baseCol, runeCol, runeCol.a);

    // Skip pixels that are already fully transparent in the source so the
    // dissolve doesn't paint a square outline around the art.
    if (col.a < 0.02) discard;

    // Dissolve mask. Bias the noise so the threshold range covers 0..1.
    float n = fbm(vUv * 5.5) * 0.85 + 0.075;

    // Effective threshold can exceed 1 to guarantee total dissolve at the end.
    float th = uThreshold * 1.15;

    if (n < th) {
        discard;
    }

    // Glowing edge band right above the threshold.
    float edgeWidth = 0.10;
    if (n < th + edgeWidth) {
        float k = 1.0 - (n - th) / edgeWidth;
        // Hot inner edge → fall off through the spell color.
        col.rgb = mix(col.rgb, uEdgeColor, k);
        col.rgb += uEdgeColor * k * 1.2;
        col.a = max(col.a, k);
    }

    gl_FragColor = col;
}
`;

// Single-texture variant — same dissolve logic but reads one texture
// instead of compositing two. Used for scroll / item dissolves.
export const DISSOLVE_FRAGMENT_SHADER_SINGLE = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform sampler2D uTex;
uniform float uThreshold;
uniform vec3 uEdgeColor;

${GLSL_HASH}
${GLSL_NOISE}
${GLSL_FBM_3}

void main() {
    vec4 col = texture2D(uTex, vUv);
    if (col.a < 0.02) discard;

    float n = fbm(vUv * 5.5) * 0.85 + 0.075;
    float th = uThreshold * 1.15;

    if (n < th) discard;

    float edgeWidth = 0.10;
    if (n < th + edgeWidth) {
        float k = 1.0 - (n - th) / edgeWidth;
        col.rgb = mix(col.rgb, uEdgeColor, k);
        col.rgb += uEdgeColor * k * 1.2;
        col.a = max(col.a, k);
    }

    gl_FragColor = col;
}
`;

export const DISSOLVE_VERTEX_SHADER = /* glsl */ `
attribute vec2 aPosition;
attribute vec2 aUv;
varying vec2 vUv;
void main() {
    vUv = aUv;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;
