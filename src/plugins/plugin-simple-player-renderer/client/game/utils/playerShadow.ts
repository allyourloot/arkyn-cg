import {
    CircleGeometry,
    type Group,
    MathUtils,
    Mesh,
    MeshBasicMaterial,
    type Object3D,
    Raycaster,
    type Scene,
    Vector3,
} from "three";

const SHADOW_RADIUS = 0.35;
const SHADOW_MAX_OPACITY = 0.3;
const SHADOW_Y_OFFSET = 0.015;
const MAX_CAST_DISTANCE = 10;
const SHADOW_SEGMENTS = 16;
const GROUND_Y_LERP_SPEED = 12;

// When edge probes detect a Y difference of Y_DIFF_SHRINK_MAX or more the
// shadow shrinks to 50 % of its base size so it doesn't visually float over
// an adjacent lower block or clip into a higher one.
const Y_DIFF_SHRINK_MAX = 2;

const EDGE_PROBE_RADIUS = SHADOW_RADIUS * 0.7;
const EDGE_PROBES: ReadonlyArray<readonly [number, number]> = [
    [EDGE_PROBE_RADIUS, 0],
    [-EDGE_PROBE_RADIUS, 0],
    [0, EDGE_PROBE_RADIUS],
    [0, -EDGE_PROBE_RADIUS],
];

const raycaster = new Raycaster();
const down = new Vector3(0, -1, 0);
const origin = new Vector3();

let geometry: CircleGeometry | null = null;

function getSharedGeometry(): CircleGeometry {
    if (!geometry) {
        geometry = new CircleGeometry(SHADOW_RADIUS, SHADOW_SEGMENTS);
        geometry.rotateX(-Math.PI / 2);
    }
    return geometry;
}

export function createPlayerShadow(): Mesh {
    const material = new MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: SHADOW_MAX_OPACITY,
        depthWrite: false,
    });

    const shadow = new Mesh(getSharedGeometry(), material);
    shadow.name = "player-shadow";
    shadow.raycast = () => {};
    return shadow;
}

type GroundProbe = { centerY: number; maxEdgeYDiff: number };

function getTargets(scene: Scene): Object3D[] {
    return scene.children.filter(c => !c.name.startsWith("remote-player-"));
}

function castDown(targets: Object3D[]): number | null {
    const hits = raycaster.intersectObjects(targets, true);
    return hits.length > 0 ? hits[0].point.y : null;
}

function probeGround(feetX: number, feetY: number, feetZ: number, scene: Scene): GroundProbe | null {
    const targets = getTargets(scene);

    origin.set(feetX, feetY + 0.5, feetZ);
    raycaster.set(origin, down);
    raycaster.far = MAX_CAST_DISTANCE + 0.5;

    const centerY = castDown(targets);
    if (centerY === null) return null;

    let maxEdgeYDiff = 0;
    for (const [dx, dz] of EDGE_PROBES) {
        origin.set(feetX + dx, feetY + 0.5, feetZ + dz);
        raycaster.set(origin, down);
        const edgeY = castDown(targets);
        if (edgeY !== null) {
            maxEdgeYDiff = Math.max(maxEdgeYDiff, Math.abs(edgeY - centerY));
        }
    }

    return { centerY, maxEdgeYDiff };
}

function applyShadowProbe(shadow: Mesh, feetY: number, probe: GroundProbe): number {
    shadow.visible = true;

    const now = performance.now();
    const prevTime = (shadow.userData.lastUpdateMs as number) || now;
    const dt = Math.min((now - prevTime) / 1000, 0.1);
    shadow.userData.lastUpdateMs = now;

    const prevGroundY = (shadow.userData.smoothedGroundY as number) ?? probe.centerY;
    const lerpFactor = MathUtils.clamp(GROUND_Y_LERP_SPEED * dt, 0, 1);
    const smoothedGroundY = MathUtils.lerp(prevGroundY, probe.centerY, lerpFactor);
    shadow.userData.smoothedGroundY = smoothedGroundY;

    const dist = Math.max(0, feetY - smoothedGroundY);
    const distanceFade = MathUtils.clamp(1 - dist / MAX_CAST_DISTANCE, 0, 1);

    const edgeShrink = MathUtils.clamp(probe.maxEdgeYDiff / Y_DIFF_SHRINK_MAX, 0, 1);
    const edgeScale = MathUtils.lerp(1, 0.5, edgeShrink);

    shadow.scale.setScalar(MathUtils.lerp(0.5, 1, distanceFade) * edgeScale);
    (shadow.material as MeshBasicMaterial).opacity = SHADOW_MAX_OPACITY * distanceFade;

    return smoothedGroundY;
}

export function updatePlayerShadow(shadow: Mesh, playerGroup: Group, scene: Scene) {
    playerGroup.getWorldPosition(origin);
    const feetX = origin.x;
    const feetY = origin.y;
    const feetZ = origin.z;

    const probe = probeGround(feetX, feetY, feetZ, scene);
    if (!probe) {
        shadow.visible = false;
        return;
    }

    const smoothedGroundY = applyShadowProbe(shadow, feetY, probe);
    shadow.position.y = smoothedGroundY - feetY + SHADOW_Y_OFFSET;
    shadow.rotation.y = -playerGroup.rotation.y;
}

export function updateLocalPlayerShadow(
    shadow: Mesh,
    feetX: number,
    feetY: number,
    feetZ: number,
    scene: Scene,
) {
    const probe = probeGround(feetX, feetY, feetZ, scene);
    if (!probe) {
        shadow.visible = false;
        return;
    }

    const smoothedGroundY = applyShadowProbe(shadow, feetY, probe);
    shadow.position.set(feetX, smoothedGroundY + SHADOW_Y_OFFSET, feetZ);
}
