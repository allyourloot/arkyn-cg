import { MathUtils, type Group, type Object3D } from "three";
import type { RemotePlayerRenderData } from "./remotePlayerState";

const HEAD_PITCH_LIMIT = 1.2;
const LOOK_ROTATION_LERP_ALPHA = 0.24;
const UPPER_PITCH_MULTIPLIER = 0.35;
const HEAD_ANCHOR_NAME = "head-anchor";
const WALK_DISTANCE_EPSILON = 0.0005;
const WALK_CYCLE_DISTANCE_MULTIPLIER = 2;
const WALK_SWING_RADIANS = 0.95;
const WALK_ROTATION_LERP_ALPHA = 0.22;

export function animateRemotePlayerLook(playerObject: Group) {
    const data = playerObject.userData as RemotePlayerRenderData;
    cacheLookNodes(playerObject);
    if (!data.head && !data.upper) return;

    const targetPitch = MathUtils.clamp(data.renderPitch ?? 0, -HEAD_PITCH_LIMIT, HEAD_PITCH_LIMIT);

    if (data.head) {
        const baseRotationX = data.headBaseRotationX ?? 0;
        data.head.rotation.x = MathUtils.lerp(
            data.head.rotation.x,
            baseRotationX + targetPitch,
            LOOK_ROTATION_LERP_ALPHA,
        );
    }

    if (data.upper) {
        const baseRotationX = data.upperBaseRotationX ?? 0;
        data.upper.rotation.x = MathUtils.lerp(
            data.upper.rotation.x,
            baseRotationX + (targetPitch * UPPER_PITCH_MULTIPLIER),
            LOOK_ROTATION_LERP_ALPHA,
        );
    }
}

export function animateRemotePlayerLegs(playerObject: Group) {
    const data = playerObject.userData as RemotePlayerRenderData;
    cacheLegAnimationData(playerObject);
    if (!data.legLeft || !data.legRight || !data.armLeft || !data.armRight) return;

    const previousX = data.lastPositionX ?? playerObject.position.x;
    const previousZ = data.lastPositionZ ?? playerObject.position.z;
    const deltaX = playerObject.position.x - previousX;
    const deltaZ = playerObject.position.z - previousZ;
    const horizontalDistance = Math.hypot(deltaX, deltaZ);
    data.lastPositionX = playerObject.position.x;
    data.lastPositionZ = playerObject.position.z;

    const leftBaseRotationX = data.legLeftBaseRotationX ?? 0;
    const rightBaseRotationX = data.legRightBaseRotationX ?? 0;
    const leftArmBaseRotationX = data.armLeftBaseRotationX ?? 0;
    const rightArmBaseRotationX = data.armRightBaseRotationX ?? 0;
    let leftTargetRotationX = leftBaseRotationX;
    let rightTargetRotationX = rightBaseRotationX;
    let leftArmTargetRotationX = leftArmBaseRotationX;
    let rightArmTargetRotationX = rightArmBaseRotationX;

    if (horizontalDistance > WALK_DISTANCE_EPSILON) {
        const nextPhase = (data.walkCyclePhase ?? 0) + (horizontalDistance * WALK_CYCLE_DISTANCE_MULTIPLIER);
        data.walkCyclePhase = nextPhase;
        const swing = Math.sin(nextPhase) * WALK_SWING_RADIANS;
        leftTargetRotationX += swing;
        rightTargetRotationX -= swing;
        leftArmTargetRotationX -= swing;
        rightArmTargetRotationX += swing;
    }

    data.legLeft.rotation.x = MathUtils.lerp(
        data.legLeft.rotation.x,
        leftTargetRotationX,
        WALK_ROTATION_LERP_ALPHA,
    );
    data.legRight.rotation.x = MathUtils.lerp(
        data.legRight.rotation.x,
        rightTargetRotationX,
        WALK_ROTATION_LERP_ALPHA,
    );
    data.armLeft.rotation.x = MathUtils.lerp(
        data.armLeft.rotation.x,
        leftArmTargetRotationX,
        WALK_ROTATION_LERP_ALPHA,
    );
    data.armRight.rotation.x = MathUtils.lerp(
        data.armRight.rotation.x,
        rightArmTargetRotationX,
        WALK_ROTATION_LERP_ALPHA,
    );
}

function cacheLookNodes(playerObject: Group) {
    const data = playerObject.userData as RemotePlayerRenderData;
    if (data.head !== undefined) return;

    const headAnchor = findChildByName(playerObject, HEAD_ANCHOR_NAME);
    data.head = headAnchor?.parent ?? findChildByName(playerObject, "head");
    data.upper = findChildByName(playerObject, "upper");
    data.headBaseRotationX = data.head?.rotation.x ?? 0;
    data.upperBaseRotationX = data.upper?.rotation.x ?? 0;
}

function cacheLegAnimationData(playerObject: Group) {
    const data = playerObject.userData as RemotePlayerRenderData;
    if (data.legLeft !== undefined && data.legRight !== undefined) return;

    data.legLeft = findChildByName(playerObject, "leg-left");
    data.legRight = findChildByName(playerObject, "leg-right");
    data.armLeft = findChildByName(playerObject, "arm-left");
    data.armRight = findChildByName(playerObject, "arm-right");
    data.legLeftBaseRotationX = data.legLeft?.rotation.x ?? 0;
    data.legRightBaseRotationX = data.legRight?.rotation.x ?? 0;
    data.armLeftBaseRotationX = data.armLeft?.rotation.x ?? 0;
    data.armRightBaseRotationX = data.armRight?.rotation.x ?? 0;
    data.walkCyclePhase = 0;
    data.lastPositionX = playerObject.position.x;
    data.lastPositionZ = playerObject.position.z;
}

function findChildByName(root: Object3D, targetName: string): Object3D | null {
    if (root.name === targetName) return root;

    for (const child of root.children) {
        const found = findChildByName(child, targetName);
        if (found) return found;
    }

    return null;
}
