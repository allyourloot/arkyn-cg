import { ClientPlugin, type ClientRuntime } from "@core/client";
import { Logger } from "@core/shared/utils";
import type { PluginState } from "@core/shared";
import type { ThreeJSRendererInterface } from "@plugins/plugin-threejs-renderer/client";
import type { VoxelWorldClientInterface } from "@plugins/plugin-voxel-world/client";
import type { MovementState } from "../shared";
import MovementUI from "./ui";
import { setupCameraLook } from "./systems/cameraLook";
import { createPlayerMovementSystem } from "./systems/playerMovement";
import { createSendLocalPositionSystem } from "./systems/sendLocalPosition";
import { MovementStateInterfaceImpl as MovementInterfaceImpl } from "./interfaces/MovementInterfaceImpl";

const logger = new Logger("MovementClient");
export function PluginMovementClient(): ClientPlugin {
    return new ClientPlugin({
        id: "plugin-movement",
        name: "Movement",
        version: "0.0.1",
        description: "Player camera and movement controls",
        author: "Hytopia",
        dependencies: ["plugin-threejs-renderer", "plugin-voxel-world"],
        init: async (runtime: ClientRuntime, state: PluginState) => {
            const rendererInterface = runtime.getInterface<ThreeJSRendererInterface>("renderer");
            const voxelWorldInterface = runtime.getInterface<VoxelWorldClientInterface>("voxel-world");
            if (!rendererInterface || !voxelWorldInterface) {
                logger.error("Missing dependencies: renderer and voxel-world interfaces are required");
                return;
            }

            const camera = rendererInterface.getCamera();
            const renderer = rendererInterface.getRenderer();
            const cameraLook = setupCameraLook(camera, renderer);

            // Input
            const keysPressed = new Set<string>();
            const joystickInput = { strafe: 0, forward: 0 };
            document.addEventListener("keydown", (event) => keysPressed.add(event.code));
            document.addEventListener("keyup", (event) => keysPressed.delete(event.code));

            // Overlays
            runtime.addOverlay(<MovementUI />);

            // Systems
            runtime.addSystem("PRE_UPDATE", cameraLook.update);
            runtime.addSystem("FIXED_UPDATE", createSendLocalPositionSystem(runtime));
            runtime.addSystem("PRE_UPDATE", createPlayerMovementSystem(camera, keysPressed, joystickInput, voxelWorldInterface));

            // Interfaces
            const movementInterfaceImpl = new MovementInterfaceImpl(state as MovementState);
            runtime.addInterface("movement", movementInterfaceImpl);

            logger.info("Movement initialized (click to capture pointer)");
        },
    });
}

export type { MovementPlayerTransform, MovementInterface } from "./interfaces/MovementInterface";
