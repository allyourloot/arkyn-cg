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

export const DISSOLVE_VERTEX_SHADER = /* glsl */ `
attribute vec2 aPosition;
attribute vec2 aUv;
varying vec2 vUv;
void main() {
    vUv = aUv;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;
