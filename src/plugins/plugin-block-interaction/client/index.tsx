import { ClientPlugin, type ClientRuntime } from "@core/client";
import type { PluginState } from "@core/shared";
import { Logger } from "@core/shared/utils";
import type { SimpleHotbarClientInterface } from "@plugins/plugin-simple-hotbar/client";
import type { ThreeJSRendererInterface } from "@plugins/plugin-threejs-renderer/client";
import type { VoxelWorldClientInterface } from "@plugins/plugin-voxel-world/client";
import {
    BLOCK_INTERACTION_DESTROY_MESSAGE,
    BLOCK_INTERACTION_PLACE_MESSAGE,
} from "../shared";
import type { BlockOverlayInterface } from "@plugins/plugin-block-overlay/client";

const logger = new Logger("BlockInteractionClient");

type ConnectionLike = {
    room?: {
        send(type: string, payload: unknown): void;
    };
};

export function PluginBlockInteractionClient(): ClientPlugin {
    return new ClientPlugin({
        id: "plugin-block-interaction",
        name: "Block Interaction",
        version: "0.0.1",
        description: "Allows players to break and place blocks by clicking.",
        author: "Matt (@matt)",
        dependencies: ["plugin-threejs-renderer", "plugin-voxel-world", "plugin-block-overlay", "plugin-simple-hotbar"],
        init: async (runtime: ClientRuntime, _state: PluginState) => {
            const connection = runtime.getInterface<ConnectionLike>("connection");
            const room = connection?.room;
            if (!room) {
                logger.error("No room connection available");
                return;
            }

            const renderer = runtime.getInterface<ThreeJSRendererInterface>("renderer");
            const voxelWorld = runtime.getInterface<VoxelWorldClientInterface>("voxel-world");
            const blockOverlay = runtime.getInterface<BlockOverlayInterface>("block-overlay");
            const hotbar = runtime.getInterface<SimpleHotbarClientInterface>("simple-hotbar");
            if (!renderer || !voxelWorld || !blockOverlay || !hotbar) {
                logger.error("Missing dependencies: renderer, voxel-world, block-overlay, simple-hotbar");
                return;
            }

            const onMouseDown = (event: MouseEvent) => {
                if (document.pointerLockElement !== renderer.getRenderer().domElement) return;

                const hit = blockOverlay.getLatestHit();
                if (!hit) return;

                if (event.button === 0) {
                    room.send(BLOCK_INTERACTION_DESTROY_MESSAGE, { x: hit.x, y: hit.y, z: hit.z });
                    return;
                }

                if (event.button === 1) {
                    event.preventDefault();
                    const selectedSlot = hotbar.getSelectedSlot();
                    const lookedAtBlockId = voxelWorld.getBlock(hit.x, hit.y, hit.z);
                    if (lookedAtBlockId <= 0) return;
                    hotbar.setHotbarItem(selectedSlot, lookedAtBlockId);
                    return;
                }

                if (event.button === 2) {
                    const placeX = hit.x + hit.normalX;
                    const placeY = hit.y + hit.normalY;
                    const placeZ = hit.z + hit.normalZ;
                    if (voxelWorld.getBlock(placeX, placeY, placeZ) !== 0) return;

                    const slots = hotbar.getHotbarSlots();
                    const selectedSlot = hotbar.getSelectedSlot();
                    const blockId = slots[selectedSlot] ?? 0;
                    if (blockId <= 0) return;

                    room.send(BLOCK_INTERACTION_PLACE_MESSAGE, { x: placeX, y: placeY, z: placeZ, blockId });
                }
            };

            const onContextMenu = (event: MouseEvent) => {
                if (document.pointerLockElement === renderer.getRenderer().domElement) {
                    event.preventDefault();
                }
            };

            window.addEventListener("mousedown", onMouseDown);
            window.addEventListener("contextmenu", onContextMenu);
            logger.info("Block interaction client plugin initialized");
        },
    });
}
