import * as THREE from "three";
import type { Camera, WebGLRenderer } from "three";

const SENSITIVITY = 0.002;
const MIN_POLAR_ANGLE = 0.1;
const MAX_POLAR_ANGLE = Math.PI - 0.1;
const FALLBACK_MAX_DELTA = 150;

export function setupCameraLook(camera: Camera, renderer: WebGLRenderer) {
    const euler = new THREE.Euler(0, 0, 0, "YXZ");
    euler.setFromQuaternion(camera.quaternion);
    let pendingDeltaX = 0;
    let pendingDeltaY = 0;
    let isLocked = false;
    let hasRawInput = false;

    function applyLookDelta(deltaX: number, deltaY: number) {
        euler.y -= deltaX * SENSITIVITY;
        euler.x -= deltaY * SENSITIVITY;
        euler.x = Math.max(
            MIN_POLAR_ANGLE - Math.PI / 2,
            Math.min(MAX_POLAR_ANGLE - Math.PI / 2, euler.x),
        );
        camera.quaternion.setFromEuler(euler);
    }

    function onMouseMove(event: MouseEvent) {
        if (hasRawInput) {
            pendingDeltaX += event.movementX;
            pendingDeltaY += event.movementY;
        } else {
            pendingDeltaX += Math.max(-FALLBACK_MAX_DELTA, Math.min(FALLBACK_MAX_DELTA, event.movementX));
            pendingDeltaY += Math.max(-FALLBACK_MAX_DELTA, Math.min(FALLBACK_MAX_DELTA, event.movementY));
        }
    }

    function onPointerLockChange() {
        if (document.pointerLockElement === renderer.domElement) {
            if (!isLocked) {
                isLocked = true;
                hasRawInput = false;

                try {
                    const maybePromise = (renderer.domElement.requestPointerLock as unknown as ((opts: { unadjustedMovement: boolean }) => unknown))({ unadjustedMovement: true });
                    if (maybePromise && typeof (maybePromise as Promise<unknown>).then === "function") {
                        (maybePromise as Promise<unknown>)
                            .then(() => {
                                hasRawInput = true;
                            })
                            .catch(() => {
                                hasRawInput = false;
                            });
                    }
                } catch {
                    hasRawInput = false;
                }

                let skipFirst = true;
                const filteredMouseMove = (event: MouseEvent) => {
                    if (skipFirst) {
                        skipFirst = false;
                        return;
                    }
                    onMouseMove(event);
                };
                (onPointerLockChange as { _filteredMouseMove?: (event: MouseEvent) => void })._filteredMouseMove = filteredMouseMove;
                document.addEventListener("mousemove", filteredMouseMove);
            }
        } else {
            isLocked = false;
            hasRawInput = false;
            const previous = (onPointerLockChange as { _filteredMouseMove?: (event: MouseEvent) => void })._filteredMouseMove;
            if (previous) {
                document.removeEventListener("mousemove", previous);
            }
        }
    }

    renderer.domElement.addEventListener("click", () => {
        if (document.pointerLockElement !== renderer.domElement) {
            renderer.domElement.requestPointerLock();
        }
    });

    document.addEventListener("pointerlockchange", onPointerLockChange);

    return {
        addLookDelta: (deltaX: number, deltaY: number) => {
            pendingDeltaX += deltaX;
            pendingDeltaY += deltaY;
        },
        update: () => {
            if (pendingDeltaX === 0 && pendingDeltaY === 0) return;
            applyLookDelta(pendingDeltaX, pendingDeltaY);
            pendingDeltaX = 0;
            pendingDeltaY = 0;
        },
    };
}
