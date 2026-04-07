import type { ClientRuntime, ClientSystemContext } from "@core/client";
import { Euler } from "three";
import type { ThreeJSRendererInterface } from "@plugins/plugin-threejs-renderer/client";
import { MOVEMENT_UPDATE_POSITION_MESSAGE } from "../../shared";

const POSITION_SEND_INTERVAL_MS = 50;
const PLAYER_EYE_HEIGHT = 1.6;

export function createSendLocalPositionSystem(runtime: ClientRuntime) {
    const cameraEuler = new Euler(0, 0, 0, "YXZ");
    let accumulatedMs = 0;

    const rendererInterface = runtime.getInterface<ThreeJSRendererInterface>("renderer");
    if (!rendererInterface) {
        throw new Error("ThreeJS renderer interface not found");
    }
    
    return (context: ClientSystemContext) => {
        accumulatedMs += context.deltaMs;
        if (accumulatedMs < POSITION_SEND_INTERVAL_MS) {
            return;
        }

        accumulatedMs -= POSITION_SEND_INTERVAL_MS;

        const camera = rendererInterface.getCamera();
        cameraEuler.setFromQuaternion(camera.quaternion);
        runtime.sendMessage(MOVEMENT_UPDATE_POSITION_MESSAGE, {
            x: camera.position.x,
            y: camera.position.y - PLAYER_EYE_HEIGHT,
            z: camera.position.z,
            yaw: cameraEuler.y,
            pitch: cameraEuler.x,
        });
    };
}
