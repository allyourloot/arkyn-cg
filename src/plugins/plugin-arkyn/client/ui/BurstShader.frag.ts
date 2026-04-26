// Fragment shader for the pack-purchase "burst" effect.
//
// Approach: forward-projection per-shard. The pack texture is divided
// into a CELL_SCALE × CELL_SCALE grid (currently 9×9 = 81 shards).
// Each shard has its own deterministic velocity (radial outward +
// tangential drift), rotation rate, and size variation, all seeded
// from a hash of its grid coordinates.
//
// For every display pixel, we iterate ALL 81 shards. For each shard:
//   1. Skip if the shard has already vanished (cheapest reject).
//   2. AABB quick-reject if the display pixel is far from the shard's
//      current center (no rotation work needed).
//   3. For nearby shards: inverse-transform the display pixel into the
//      shard's rotated local frame, test against the shard's bounds,
//      and sample the texture at the corresponding origin position.
//   4. Pick the fastest matching shard so overlapping shards resolve
//      to a stable winner.
//
// Why iterate all 81 shards instead of a localized search:
//   - The previous SEARCH_RADIUS estimate worked for tight canvases
//     (PACK_SCALE ≤ 1.8) but missed shards once the canvas grew
//     enough that estimate error exceeded the search radius.
//   - 81 iterations with cheap early-rejects (vanish + AABB) is
//     comfortable on modern GPUs and removes the search-radius
//     trade-off entirely.
//
// Edge fade: alpha falls off in the outer 18% of the canvas so any
// shards that DO reach the canvas edge dissolve smoothly into
// transparency rather than terminating at a hard rectangular boundary.
export const BURST_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform sampler2D uTex;
uniform float uTime;     // 0..1
uniform vec3 uTint;      // pack element color

// Canvas-to-pack scale. Pack occupies the central 1/PACK_SCALE of the
// canvas in both dimensions. MUST match the BurstCanvas consumer's
// burstScale in ArkynOverlay.
const float PACK_SCALE = 2.5;

// Pack subdivisions. Higher = more shards / smaller pieces.
const float CELL_SCALE = 9.0;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    // Map canvas UV → pack texture UV.
    vec2 packUv = (vUv - 0.5) * PACK_SCALE + 0.5;

    // Best-match shard so far. We pick the fastest one when multiple
    // shards overlap a pixel.
    float bestSpeed = -1.0;
    float bestHash = 0.0;
    vec4 bestSample = vec4(0.0);

    for (int cy = 0; cy < 9; cy++) {
        for (int cx = 0; cx < 9; cx++) {
            vec2 cellId = vec2(float(cx), float(cy));
            float h = hash(cellId);

            // Cheapest reject — shard has already vanished.
            float vanishTime = 0.4 + h * 0.55;
            if (uTime > vanishTime) continue;

            float h2 = hash(cellId + vec2(7.3, 13.1));

            // Per-shard size variation (0.7×–1.3×) — uniform-grid
            // shards reading as visually irregular debris because the
            // sizes vary cell-to-cell.
            float sizeFactor = 0.7 + h2 * 0.6;
            float halfSize = (0.55 / CELL_SCALE) * sizeFactor;

            // Per-shard velocity: radial outward + tangential drift.
            vec2 originUv = (cellId + 0.5) / CELL_SCALE;
            vec2 cellD = originUv - 0.5;
            float cellR = max(length(cellD), 0.001);
            vec2 outDir = cellD / cellR;
            vec2 tanDir = vec2(-outDir.y, outDir.x);
            float speed = 0.55 + h * 0.7;
            float drift = (h2 - 0.5) * 0.5;
            vec2 vel = outDir * speed + tanDir * drift;

            // AABB quick-reject — if pixel is way outside this shard's
            // possible footprint (after rotation, AABB is √2× the
            // shard's halfSize), skip rotation/texture work.
            vec2 toShard = packUv - (originUv + vel * uTime);
            float quickExtent = halfSize * 1.45;
            if (abs(toShard.x) > quickExtent ||
                abs(toShard.y) > quickExtent) continue;

            // Per-shard rotation rate.
            float rotRate = (h2 - 0.5) * 8.0;
            float angle = rotRate * uTime;
            float ca = cos(angle);
            float sa = sin(angle);

            // Inverse-transform pixel into shard's local frame.
            vec2 localOffset = vec2(
                ca * toShard.x + sa * toShard.y,
                -sa * toShard.x + ca * toShard.y
            );

            // Tight bounds check in shard's local frame.
            if (abs(localOffset.x) > halfSize ||
                abs(localOffset.y) > halfSize) continue;

            // Source UV in original pack texture.
            vec2 srcUv = originUv + localOffset;
            if (srcUv.x < 0.0 || srcUv.x > 1.0 ||
                srcUv.y < 0.0 || srcUv.y > 1.0) continue;

            vec4 s = texture2D(uTex, srcUv);
            if (s.a < 0.02) continue;

            if (speed > bestSpeed) {
                bestSpeed = speed;
                bestHash = h;
                bestSample = s;
            }
        }
    }

    if (bestSpeed < 0.0) discard;

    // Color treatment.
    vec3 color = bestSample.rgb;

    // Subtle element-tint ignition early in the burst.
    float ignite = smoothstep(0.0, 0.08, uTime) * (1.0 - smoothstep(0.1, 0.35, uTime));
    color += uTint * ignite * 0.5;

    // Heated leading-edge glow on shards that have traveled far.
    float travel = bestSpeed * uTime;
    color += uTint * smoothstep(0.1, 0.5, travel) * 0.4;

    // Per-shard alpha fade toward its vanish time.
    float vanishTime = 0.4 + bestHash * 0.55;
    float alpha = bestSample.a * (1.0 - smoothstep(vanishTime - 0.2, vanishTime, uTime));

    // Edge fade — fall off alpha in the outer rim of the canvas so
    // shards approaching the rectangular boundary dissolve into the
    // surroundings rather than truncating against a hard edge.
    vec2 toEdge = min(vUv, 1.0 - vUv);
    float edgeDist = min(toEdge.x, toEdge.y);
    float edgeFade = smoothstep(0.0, 0.18, edgeDist);
    alpha *= edgeFade;

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
