import { ClientPlugin, type ClientRuntime } from "@core/client";
import type { PluginState } from "@core/shared";
import { Logger } from "@core/shared/utils";
import type { ThreeJSRendererInterface } from "@plugins/plugin-threejs-renderer/client";
import type { VoxelWorldClientInterface } from "@plugins/plugin-voxel-world/client";
import { BoxGeometry, EdgesGeometry, LineBasicMaterial, LineSegments, Vector3 } from "three";
import { BlockOverlayInterfaceImpl } from "./interfaces/BlockOverlayInterfaceImpl";
import { raycastSolidBlock } from "./utils/raycastSolidBlock";
import type { BlockOverlayInterface } from "./interfaces/BlockOverlayInterface";

const logger = new Logger("BlockOverlayClient");
const MAX_INTERACTION_DISTANCE = 8;

const rayDirection = new Vector3();
const rayOrigin = new Vector3();

export function PluginBlockOverlayClient(): ClientPlugin {
    return new ClientPlugin({
        id: "plugin-block-overlay",
        name: "Block Overlay",
        version: "0.0.1",
        description: "Renders a wireframe highlight on the block the player is looking at.",
        author: "Hytopia",
        dependencies: ["plugin-threejs-renderer", "plugin-voxel-world"],
        init: async (runtime: ClientRuntime, _pluginState: PluginState) => {
            const renderer = runtime.getInterface<ThreeJSRendererInterface>("renderer");
            if (!renderer) {
                logger.error("Renderer interface not found");
                return;
            }

            const voxelWorld = runtime.getInterface<VoxelWorldClientInterface>("voxel-world");
            if (!voxelWorld) {
                logger.error("Voxel world interface not found");
                return;
            }

            const scene = renderer.getScene();
            const camera = renderer.getCamera();

            const geometry = new EdgesGeometry(new BoxGeometry(1.01, 1.01, 1.01));
            const material = new LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.75 });
            const targetOverlay = new LineSegments(geometry, material);
            targetOverlay.visible = false;
            targetOverlay.renderOrder = 1000;
            scene.add(targetOverlay);

            const overlayInterface = new BlockOverlayInterfaceImpl();
            runtime.addInterface("block-overlay", overlayInterface);

            runtime.addSystem("PRE_UPDATE", () => {
                camera.getWorldPosition(rayOrigin);
                camera.getWorldDirection(rayDirection);
                const hit = raycastSolidBlock(voxelWorld, rayOrigin, rayDirection, MAX_INTERACTION_DISTANCE);
                overlayInterface.setLatestHit(hit);

                if (!hit) {
                    targetOverlay.visible = false;
                    return;
                }

                targetOverlay.visible = true;
                targetOverlay.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
            });
        },
    });
}

export type { BlockOverlayInterface };
