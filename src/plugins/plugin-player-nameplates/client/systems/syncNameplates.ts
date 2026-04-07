import type { Camera } from "three";
import { MathUtils, Vector3 } from "three";
import type { MovementInterface } from "@plugins/plugin-movement/client";
import type { AuthClientInterface } from "@plugins/plugin-auth/client";
import { setNameplates, type ScreenNameplate } from "../nameplateStore";

const NAMEPLATE_HEIGHT_OFFSET = 2.1;
const STATE_EPSILON = 0.0001;
const DEFAULT_INTERPOLATION_DURATION_MS = 150;
const MIN_INTERPOLATION_DURATION_MS = 16;
const MAX_INTERPOLATION_DURATION_MS = 250;

type NameplateInterpolationState = {
    previousX: number;
    previousY: number;
    previousZ: number;
    nextX: number;
    nextY: number;
    nextZ: number;
    interpolationStartedAtMs: number;
    interpolationDurationMs: number;
    lastServerUpdateAtMs: number;
};

const tempWorldPos = new Vector3();
const tempNdcPos = new Vector3();
const tempCameraWorldPos = new Vector3();
const tempCameraDirection = new Vector3();
const tempToPlayer = new Vector3();
const seenSessionIds = new Set<string>();

export function createSyncNameplatesSystem(
    movement: MovementInterface,
    auth: AuthClientInterface,
    camera: Camera,
    localSessionId: string,
) {
    const interpolationBySessionId = new Map<string, NameplateInterpolationState>();

    return () => {
        const nowMs = performance.now();
        const next: ScreenNameplate[] = [];
        seenSessionIds.clear();
        camera.getWorldPosition(tempCameraWorldPos);
        camera.getWorldDirection(tempCameraDirection);

        for (const [sessionId, transform] of movement.getPlayers()) {
            if (sessionId === localSessionId) continue;
            seenSessionIds.add(sessionId);

            const user = auth.getUserBySessionId(sessionId);
            if (!user) continue;

            let interpolationState = interpolationBySessionId.get(sessionId);
            if (!interpolationState) {
                interpolationState = {
                    previousX: transform.x,
                    previousY: transform.y,
                    previousZ: transform.z,
                    nextX: transform.x,
                    nextY: transform.y,
                    nextZ: transform.z,
                    interpolationStartedAtMs: nowMs,
                    interpolationDurationMs: DEFAULT_INTERPOLATION_DURATION_MS,
                    lastServerUpdateAtMs: nowMs,
                };
                interpolationBySessionId.set(sessionId, interpolationState);
            } else if (hasServerStateChanged(interpolationState, transform.x, transform.y, transform.z)) {
                setInterpolatedWorldPosition(interpolationState, nowMs, tempWorldPos);
                const durationMs = MathUtils.clamp(
                    nowMs - interpolationState.lastServerUpdateAtMs,
                    MIN_INTERPOLATION_DURATION_MS,
                    MAX_INTERPOLATION_DURATION_MS,
                );

                interpolationState.previousX = tempWorldPos.x;
                interpolationState.previousY = tempWorldPos.y;
                interpolationState.previousZ = tempWorldPos.z;
                interpolationState.nextX = transform.x;
                interpolationState.nextY = transform.y;
                interpolationState.nextZ = transform.z;
                interpolationState.interpolationStartedAtMs = nowMs;
                interpolationState.interpolationDurationMs = durationMs;
                interpolationState.lastServerUpdateAtMs = nowMs;
            }

            setInterpolatedWorldPosition(interpolationState, nowMs, tempWorldPos);
            tempWorldPos.y += NAMEPLATE_HEIGHT_OFFSET;

            tempToPlayer.copy(tempWorldPos).sub(tempCameraWorldPos);
            if (tempToPlayer.dot(tempCameraDirection) <= 0) {
                continue;
            }

            tempNdcPos.copy(tempWorldPos).project(camera);
            if (tempNdcPos.z < -1 || tempNdcPos.z > 1) {
                continue;
            }

            next.push({
                sessionId,
                username: user.username,
                x: (tempNdcPos.x * 0.5 + 0.5) * window.innerWidth,
                y: (-tempNdcPos.y * 0.5 + 0.5) * window.innerHeight,
            });
        }

        for (const sessionId of interpolationBySessionId.keys()) {
            if (!seenSessionIds.has(sessionId)) {
                interpolationBySessionId.delete(sessionId);
            }
        }

        setNameplates(next);
    };
}

function hasServerStateChanged(state: NameplateInterpolationState, x: number, y: number, z: number) {
    return (
        Math.abs(state.nextX - x) > STATE_EPSILON
        || Math.abs(state.nextY - y) > STATE_EPSILON
        || Math.abs(state.nextZ - z) > STATE_EPSILON
    );
}

function setInterpolatedWorldPosition(
    state: NameplateInterpolationState,
    nowMs: number,
    target: Vector3,
) {
    const durationMs = state.interpolationDurationMs;
    const alpha = durationMs <= Number.EPSILON
        ? 1
        : MathUtils.clamp((nowMs - state.interpolationStartedAtMs) / durationMs, 0, 1);

    target.set(
        MathUtils.lerp(state.previousX, state.nextX, alpha),
        MathUtils.lerp(state.previousY, state.nextY, alpha),
        MathUtils.lerp(state.previousZ, state.nextZ, alpha),
    );
}
