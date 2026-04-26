// Fragment shader for the pack-purchase "burst" effect.
//
// Visual concept: the pack texture occupies the central region of an
// over-sized canvas (1 / PACK_SCALE in each dimension), giving fragments
// room to fly outward into the surrounding empty space. The pack is
// divided into IRREGULAR Voronoi-like cells via cellular noise — each
// cell is a polygon around a feature point that's randomly jittered
// inside its grid square, so fragments read as natural-shaped shards
// rather than a uniform square mosaic. Each cell flies outward at a
// jittered speed with slight tangential drift, and each cell has a
// staggered "vanish time" between t=0.40 and t=0.95.
//
// Tuning history:
//   - Initial pass used a uniform square grid + bright flash + ring;
//     read as a swirling square. Replaced with cell-based shatter.
//   - Square grid was replaced with cellular noise (3×3 neighbor
//     scan) so fragment shapes are irregular polygons.
//   - PACK_SCALE bumped from 1.4 → 1.8 and cellSpeed range bumped to
//     give fragments more room and reach to spread outward.
export const BURST_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform sampler2D uTex;
uniform float uTime;     // 0..1
uniform vec3 uTint;      // pack element color

// Canvas-to-pack scale. Pack occupies the central 1/PACK_SCALE of the
// canvas in both dimensions. MUST match the BurstCanvas consumer's
// burstScale in ArkynOverlay (currently 1.8). Increase to give
// fragments more room to fly; decrease for a tighter contained burst.
const float PACK_SCALE = 1.8;

// Cell granularity in pack UV space. Higher = smaller cells (more
// numerous, finer fragments); lower = chunkier shards. With cellular
// noise the visible cell sizes vary because feature points are jittered
// inside each grid square, so this is more of an "average density".
const float CELL_SCALE = 18.0;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Cellular-noise lookup: which feature point is closest to packUv?
// Returns the integer cell coords of the winning feature. Each grid
// square contains exactly one feature point at a random position
// inside the square; checking the 3×3 neighborhood guarantees we find
// the closest feature regardless of which square we're sampling near
// the edges of.
vec2 nearestFeatureCell(vec2 packUv) {
    vec2 baseCell = floor(packUv * CELL_SCALE);
    vec2 fracUv = fract(packUv * CELL_SCALE);
    vec2 nearestCell = baseCell;
    float nearestDist = 999.0;
    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            vec2 c = baseCell + vec2(float(dx), float(dy));
            // Feature point — jittered position inside this cell.
            vec2 fp = vec2(hash(c + vec2(1.7, 5.1)), hash(c + vec2(9.3, 11.7)));
            vec2 toFp = vec2(float(dx), float(dy)) + fp - fracUv;
            float dist = dot(toFp, toFp);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestCell = c;
            }
        }
    }
    return nearestCell;
}

void main() {
    // Map canvas UV → pack texture UV. Inside [0,1] = on the pack;
    // outside = surrounding empty space where fragments can fly into.
    vec2 packUv = (vUv - 0.5) * PACK_SCALE + 0.5;

    vec2 d = packUv - 0.5;
    float r = length(d);

    // Each pixel belongs to the Voronoi cell of the nearest feature
    // point. The cell ID hash drives every per-fragment property below
    // (speed, drift, vanish time) so a single contiguous fragment
    // moves and vanishes as one piece.
    vec2 cellId = nearestFeatureCell(packUv);
    float cellRand = hash(cellId);
    float cellRand2 = hash(cellId + vec2(7.3, 13.1));

    // Per-cell outward speed + tangential drift. Wider speed range
    // (0.55 → 1.25) so the fastest fragments fly nearly to the canvas
    // edge while slower ones linger closer to the pack origin.
    float cellSpeed = 0.55 + cellRand * 0.7;
    float tangentDrift = (cellRand2 - 0.5) * 0.5;

    vec2 outwardDir = r > 0.001 ? d / r : vec2(0.0);
    vec2 tangentDir = vec2(-outwardDir.y, outwardDir.x);
    vec2 vel = outwardDir * cellSpeed + tangentDir * tangentDrift;

    // Inverse-lookup: pixel currently displayed at packUv shows what
    // was at packUv - vel*t before the burst began.
    vec2 sourceUv = packUv - vel * uTime;

    if (sourceUv.x < 0.0 || sourceUv.x > 1.0 ||
        sourceUv.y < 0.0 || sourceUv.y > 1.0) discard;

    vec4 tex = texture2D(uTex, sourceUv);
    if (tex.a < 0.02) discard;

    // Per-cell vanish time — fragments disappear progressively across
    // the burst window.
    float vanishTime = 0.4 + cellRand * 0.55;
    if (uTime > vanishTime) discard;

    // Subtle element-tint ignition early in the burst.
    float ignite = smoothstep(0.0, 0.08, uTime) * (1.0 - smoothstep(0.1, 0.35, uTime));
    vec3 color = tex.rgb + uTint * ignite * 0.5;

    // Heated-fragment glow — the further a fragment has traveled, the
    // more it glows in element color.
    float travel = cellSpeed * uTime;
    color += uTint * smoothstep(0.1, 0.5, travel) * 0.4;

    // Alpha fades smoothly toward each cell's vanish time.
    float alpha = tex.a * (1.0 - smoothstep(vanishTime - 0.2, vanishTime, uTime));

    gl_FragColor = vec4(color, alpha);
}
`;

export const BURST_VERTEX_SHADER = /* glsl */ `
attribute vec2 aPosition;
attribute vec2 aUv;
varying vec2 vUv;
void main() {
    vUv = aUv;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;
