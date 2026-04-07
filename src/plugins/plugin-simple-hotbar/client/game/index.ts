import type { ClientRuntime } from "@core/client";
import { Logger } from "@core/shared/utils";
import type { VoxelWorldRendererClientInterface } from "@plugins/plugin-voxel-world-renderer/client";
import type { VoxelWorldClientInterface } from "@plugins/plugin-voxel-world/client";
import type { SimpleHotbarState } from "../../shared";
import { ENSURE_PLAYER_MESSAGE, HOTBAR_SIZE } from "../../shared";
import {
    getHotbarSlots,
    getSelectedSlot,
    selectHotbarSlot,
    bindVoxelWorldRendererInterface,
    setBlockMeta,
    setConnection,
    setHotbarItem,
    subscribe,
    type SimpleHotbarClientInterface,
} from "../hotbarStore";
import { createSyncHotbarStateSystem } from "./systems/syncHotbarState";
import { getHotbarSlotFromKeyboardEvent } from "./utils/hotbarInput";

const logger = new Logger("SimpleHotbarClient");

type ConnectionLike = {
    room?: {
        sessionId: string;
        send(type: string, data: unknown): void;
    };
};

export function initSimpleHotbarGame(runtime: ClientRuntime, state: SimpleHotbarState) {
    const connection = runtime.getInterface<ConnectionLike>("connection");
    const room = connection?.room;
    if (room) {
        setConnection((type, data) => room.send(type, data));
        room.send(ENSURE_PLAYER_MESSAGE, {});
        runtime.addSystem("PRE_UPDATE", createSyncHotbarStateSystem(state, room.sessionId));
    } else {
        logger.warn("No connection interface found; hotbar sync messages are disabled");
    }

    const voxelWorld = runtime.getInterface<VoxelWorldClientInterface>("voxel-world");
    let voxelWorldRendererBound = false;
    if (voxelWorld) {
        runtime.addSystem("PRE_UPDATE", () => {
            if (!voxelWorldRendererBound) {
                const voxelWorldRenderer = runtime.getInterface<VoxelWorldRendererClientInterface>("voxel-world-renderer");
                if (voxelWorldRenderer) {
                    bindVoxelWorldRendererInterface(voxelWorldRenderer);
                    voxelWorldRendererBound = true;
                }
            }

            for (const [id, blockType] of voxelWorld.getBlockTypes()) {
                if (!Number.isInteger(id) || id <= 0) continue;
                setBlockMeta(id, {
                    name: blockType.name ?? `Block ${id}`,
                    textureUri: blockType.textureUri ?? "",
                });
            }
        });
    }

    window.addEventListener("keydown", (event) => {
        if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
        const slot = getHotbarSlotFromKeyboardEvent(event);
        if (slot !== null) selectHotbarSlot(slot);
    });

    const hotbarInterface: SimpleHotbarClientInterface = {
        HOTBAR_SIZE,
        subscribe,
        getHotbarSlots,
        getSelectedSlot,
        selectHotbarSlot,
        setHotbarItem,
    };
    runtime.addInterface("simple-hotbar", hotbarInterface);

    logger.info("Simple hotbar client game initialized");
}

export { selectHotbarSlot, setHotbarItem } from "../hotbarStore";
