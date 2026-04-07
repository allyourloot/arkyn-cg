import { Euler, type PerspectiveCamera } from "three";

const POSITION_SEND_INTERVAL_MS = 50;
const PLAYER_EYE_HEIGHT = 1.6;
const UPDATE_POSITION_MESSAGE = "player-renderer:update-position";

type RoomLike = {
    send(type: string, payload: unknown): void;
};

export function createSendLocalPositionSystem(camera: PerspectiveCamera, room: RoomLike) {
    const cameraEuler = new Euler(0, 0, 0, "YXZ");
    let lastSendAtMs = 0;

    return () => {
        const now = performance.now();
        if (now - lastSendAtMs < POSITION_SEND_INTERVAL_MS) return;

        lastSendAtMs = now;
        cameraEuler.setFromQuaternion(camera.quaternion);
        room.send(UPDATE_POSITION_MESSAGE, {
            x: camera.position.x,
            y: camera.position.y - PLAYER_EYE_HEIGHT,
            z: camera.position.z,
            yaw: cameraEuler.y,
            pitch: cameraEuler.x,
        });
    };
}
