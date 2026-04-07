import type { ClientSystemContext } from "@core/client";
import * as THREE from "three";
import type { PerspectiveCamera } from "three";
import type { VoxelWorldClientInterface } from "@plugins/plugin-voxel-world/client";
import { moveAndCollide, type PlayerPhysicsState } from "../utils/voxelCollision";

const WALK_SPEED = 8;
const SPRINT_SPEED_MULTIPLIER = 1.5;
const SPRINT_DOUBLE_TAP_WINDOW_MS = 300;
const SPRINT_FOV_BOOST_DEGREES = 6;
const SPRINT_FOV_SMOOTHING = 0.15;
const FLY_SPEED = 16;
const FLY_VERTICAL_SPEED = 12;
const GRAVITY = -20;
const JUMP_VELOCITY = 8;
const FLY_TOGGLE_DOUBLE_TAP_WINDOW_MS = 300;

let flying = false;

export function isLocalPlayerInFlyMode() {
    return flying;
}

export function createPlayerMovementSystem(
    camera: PerspectiveCamera,
    keysPressed: Set<string>,
    joystickInput: { strafe: number; forward: number },
    voxelWorld: VoxelWorldClientInterface,
) {
    const physics: PlayerPhysicsState = { velocityY: 0, grounded: false };
    let lastSpaceTapAtMs = -Infinity;
    let lastForwardTapAtMs = -Infinity;
    let sprinting = false;
    const baseFov = camera.fov;
    let currentFov = baseFov;

    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);

    const isSolid = (bx: number, by: number, bz: number) => voxelWorld.getBlock(bx, by, bz) !== 0;

    document.addEventListener("keydown", (event) => {
        if (event.code === "KeyW" && !event.repeat) {
            const now = performance.now();
            if (now - lastForwardTapAtMs <= SPRINT_DOUBLE_TAP_WINDOW_MS) {
                sprinting = true;
                lastForwardTapAtMs = -Infinity;
            } else {
                lastForwardTapAtMs = now;
            }
        }

        if (event.code !== "Space" || event.repeat) return;

        const now = performance.now();
        if (now - lastSpaceTapAtMs <= FLY_TOGGLE_DOUBLE_TAP_WINDOW_MS) {
            flying = !flying;
            physics.velocityY = 0;
            lastSpaceTapAtMs = -Infinity;
            return;
        }

        lastSpaceTapAtMs = now;
    });

    document.addEventListener("keyup", (event) => {
        if (event.code === "KeyW") sprinting = false;
    });

    window.addEventListener("blur", () => {
        lastSpaceTapAtMs = -Infinity;
        lastForwardTapAtMs = -Infinity;
        sprinting = false;
    });

    return (context: ClientSystemContext) => {
        const dt = context.deltaMs / 1000;

        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        right.crossVectors(forward, up).normalize();

        const keyboardForward = (keysPressed.has("KeyW") ? 1 : 0) - (keysPressed.has("KeyS") ? 1 : 0);
        const keyboardStrafe = (keysPressed.has("KeyD") ? 1 : 0) - (keysPressed.has("KeyA") ? 1 : 0);
        const inputForward = keyboardForward + joystickInput.forward;
        const inputStrafe = keyboardStrafe + joystickInput.strafe;

        let moveX = forward.x * inputForward + right.x * inputStrafe;
        let moveZ = forward.z * inputForward + right.z * inputStrafe;

        const baseSpeed = flying ? FLY_SPEED : WALK_SPEED;
        const speed = sprinting && keysPressed.has("KeyW") ? baseSpeed * SPRINT_SPEED_MULTIPLIER : baseSpeed;
        const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (len > 0) {
            const scaledMagnitude = Math.min(len, 1);
            moveX = (moveX / len) * speed * dt * scaledMagnitude;
            moveZ = (moveZ / len) * speed * dt * scaledMagnitude;
        }

        let dy: number;

        if (flying) {
            physics.velocityY = 0;

            let verticalInput = 0;
            if (keysPressed.has("Space")) verticalInput += 1;
            if (keysPressed.has("ShiftLeft") || keysPressed.has("ShiftRight")) verticalInput -= 1;

            dy = verticalInput * FLY_VERTICAL_SPEED * dt;
        } else {
            if (physics.grounded && keysPressed.has("Space")) {
                physics.velocityY = JUMP_VELOCITY;
                physics.grounded = false;
            }

            physics.velocityY += GRAVITY * dt;
            dy = physics.velocityY * dt;
        }

        moveAndCollide(camera.position, moveX, dy, moveZ, physics, isSolid);

        const isSprintActive = sprinting && keysPressed.has("KeyW");
        const targetFov = isSprintActive ? baseFov + SPRINT_FOV_BOOST_DEGREES : baseFov;
        currentFov += (targetFov - currentFov) * SPRINT_FOV_SMOOTHING;
        if (Math.abs(targetFov - currentFov) < 0.01) currentFov = targetFov;

        if (Math.abs(camera.fov - currentFov) > 0.001) {
            camera.fov = currentFov;
            camera.updateProjectionMatrix();
        }
    };
}
