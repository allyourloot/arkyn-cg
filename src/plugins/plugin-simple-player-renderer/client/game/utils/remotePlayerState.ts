import { Group, MathUtils, type Mesh, type Object3D } from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { getPlayerTemplate } from "./playerModel";
import { createPlayerShadow } from "./playerShadow";
import type { MovementPlayerTransform } from "@plugins/plugin-movement/client";

const STATE_EPSILON = 0.0001;
const DEFAULT_INTERPOLATION_DURATION_MS = 150;
const MIN_INTERPOLATION_DURATION_MS = 16;
const MAX_INTERPOLATION_DURATION_MS = 250;

export type RemotePlayerRenderData = {
    previousX?: number;
    previousY?: number;
    previousZ?: number;
    previousYaw?: number;
    previousPitch?: number;
    nextX?: number;
    nextY?: number;
    nextZ?: number;
    nextYaw?: number;
    nextPitch?: number;
    renderPitch?: number;
    interpolationStartedAtMs?: number;
    interpolationDurationMs?: number;
    lastServerUpdateAtMs?: number;
    head?: Object3D | null;
    upper?: Object3D | null;
    headBaseRotationX?: number;
    upperBaseRotationX?: number;
    legLeft?: Object3D | null;
    legRight?: Object3D | null;
    armLeft?: Object3D | null;
    armRight?: Object3D | null;
    legLeftBaseRotationX?: number;
    legRightBaseRotationX?: number;
    armLeftBaseRotationX?: number;
    armRightBaseRotationX?: number;
    walkCyclePhase?: number;
    lastPositionX?: number;
    lastPositionZ?: number;
    shadow?: Mesh | null;
};

export function getOrCreateRemotePlayerObject(
    remotePlayerObjects: Map<string, Group>,
    scene: Object3D,
    sessionId: string,
    playerState: MovementPlayerTransform,
) {
    const existing = remotePlayerObjects.get(sessionId);
    if (existing) return existing;

    const instance = new Group();
    instance.name = `remote-player-${sessionId}`;
    instance.add(cloneSkeleton(getPlayerTemplate()!));

    const shadow = createPlayerShadow();
    instance.add(shadow);
    (instance.userData as RemotePlayerRenderData).shadow = shadow;

    instance.position.set(playerState.x, playerState.y, playerState.z);
    instance.rotation.y = playerState.yaw;
    commitRemoteServerState(instance, playerState);
    scene.add(instance);
    remotePlayerObjects.set(sessionId, instance);
    return instance;
}

export function commitRemoteServerState(playerObject: Group, playerState: MovementPlayerTransform) {
    const data = playerObject.userData as RemotePlayerRenderData;
    const nowMs = performance.now();

    if (
        typeof data.nextX !== "number"
        || typeof data.nextY !== "number"
        || typeof data.nextZ !== "number"
        || typeof data.nextYaw !== "number"
        || typeof data.nextPitch !== "number"
    ) {
        data.previousX = playerState.x;
        data.previousY = playerState.y;
        data.previousZ = playerState.z;
        data.previousYaw = playerState.yaw;
        data.previousPitch = playerState.pitch;
        data.nextX = playerState.x;
        data.nextY = playerState.y;
        data.nextZ = playerState.z;
        data.nextYaw = playerState.yaw;
        data.nextPitch = playerState.pitch;
        data.renderPitch = playerState.pitch;
        data.interpolationStartedAtMs = nowMs;
        data.interpolationDurationMs = DEFAULT_INTERPOLATION_DURATION_MS;
        data.lastServerUpdateAtMs = nowMs;
        return;
    }

    if (!hasServerStateChanged(data, playerState)) return;

    const previousUpdateAtMs = data.lastServerUpdateAtMs ?? nowMs;
    const durationMs = MathUtils.clamp(
        nowMs - previousUpdateAtMs,
        MIN_INTERPOLATION_DURATION_MS,
        MAX_INTERPOLATION_DURATION_MS,
    );

    data.previousX = playerObject.position.x;
    data.previousY = playerObject.position.y;
    data.previousZ = playerObject.position.z;
    data.previousYaw = playerObject.rotation.y;
    data.previousPitch = data.renderPitch ?? data.nextPitch;
    data.nextX = playerState.x;
    data.nextY = playerState.y;
    data.nextZ = playerState.z;
    data.nextYaw = playerState.yaw;
    data.nextPitch = playerState.pitch;
    data.interpolationStartedAtMs = nowMs;
    data.interpolationDurationMs = durationMs;
    data.lastServerUpdateAtMs = nowMs;
}

export function interpolateRemotePlayer(playerObject: Group) {
    const data = playerObject.userData as RemotePlayerRenderData;
    if (
        typeof data.previousX !== "number"
        || typeof data.previousY !== "number"
        || typeof data.previousZ !== "number"
        || typeof data.previousYaw !== "number"
        || typeof data.previousPitch !== "number"
        || typeof data.nextX !== "number"
        || typeof data.nextY !== "number"
        || typeof data.nextZ !== "number"
        || typeof data.nextYaw !== "number"
        || typeof data.nextPitch !== "number"
    ) {
        return;
    }

    const startedAtMs = data.interpolationStartedAtMs ?? performance.now();
    const durationMs = data.interpolationDurationMs ?? DEFAULT_INTERPOLATION_DURATION_MS;
    const clampedAlpha = durationMs <= Number.EPSILON
        ? 1
        : MathUtils.clamp((performance.now() - startedAtMs) / durationMs, 0, 1);

    playerObject.position.x = MathUtils.lerp(data.previousX, data.nextX, clampedAlpha);
    playerObject.position.y = MathUtils.lerp(data.previousY, data.nextY, clampedAlpha);
    playerObject.position.z = MathUtils.lerp(data.previousZ, data.nextZ, clampedAlpha);
    playerObject.rotation.y = lerpAngle(data.previousYaw, data.nextYaw, clampedAlpha);
    data.renderPitch = MathUtils.lerp(data.previousPitch, data.nextPitch, clampedAlpha);
}

function lerpAngle(current: number, target: number, alpha: number) {
    const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
    return current + (delta * alpha);
}

function hasServerStateChanged(data: RemotePlayerRenderData, playerState: MovementPlayerTransform) {
    if (
        typeof data.nextX !== "number"
        || typeof data.nextY !== "number"
        || typeof data.nextZ !== "number"
        || typeof data.nextYaw !== "number"
        || typeof data.nextPitch !== "number"
    ) {
        return true;
    }

    const yawDelta = Math.abs(Math.atan2(
        Math.sin(playerState.yaw - data.nextYaw),
        Math.cos(playerState.yaw - data.nextYaw),
    ));

    return (
        Math.abs(playerState.x - data.nextX) > STATE_EPSILON
        || Math.abs(playerState.y - data.nextY) > STATE_EPSILON
        || Math.abs(playerState.z - data.nextZ) > STATE_EPSILON
        || yawDelta > STATE_EPSILON
        || Math.abs(playerState.pitch - data.nextPitch) > STATE_EPSILON
    );
}
