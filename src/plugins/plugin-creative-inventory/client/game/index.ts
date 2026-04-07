import { Logger } from "@core/shared/utils";
import type { ClientRuntime } from "@core/client";
import type { SimpleFakeCursorClientInterface } from "@plugins/plugin-simple-fake-cursor/client";
import type { VoxelWorldClientInterface } from "@plugins/plugin-voxel-world/client";
import type { VoxelWorldRendererClientInterface } from "@plugins/plugin-voxel-world-renderer/client";
import { setBlockIds, setBlockMeta, setConnection } from "../inventoryStore";
import {
    bindFakeCursorInterface,
    bindHotbarInterface,
    bindVoxelWorldRendererInterface,
} from "../pluginInterfaces";

const logger = new Logger("CreativeInventoryClient");

type HotbarInterface = {
    HOTBAR_SIZE: number;
    subscribe(listener: () => void): () => void;
    getHotbarSlots(): number[];
    getSelectedSlot(): number;
    selectHotbarSlot(index: number): void;
    setHotbarItem(slot: number, blockId: number): void;
};

type ConnectionLike = {
    room?: {
        send(type: string, data: unknown): void;
    };
};

export function initCreativeInventoryGame(runtime: ClientRuntime) {
    const fakeCursorIface = runtime.getInterface<SimpleFakeCursorClientInterface>("simple-fake-cursor");
    const hotbarIface = runtime.getInterface<HotbarInterface>("simple-hotbar");
    const voxelWorldIface = runtime.getInterface<VoxelWorldClientInterface>("voxel-world");

    if (!fakeCursorIface || !hotbarIface || !voxelWorldIface) {
        logger.error("Missing dependencies: simple-fake-cursor, simple-hotbar, voxel-world");
        return;
    }

    bindFakeCursorInterface(fakeCursorIface);
    bindHotbarInterface(hotbarIface);

    const connection = runtime.getInterface<ConnectionLike>("connection");
    if (connection?.room) {
        setConnection((type, data) => connection.room!.send(type, data));
    } else {
        logger.warn("No connection interface found; hotbar sync messages are disabled");
    }

    let snapshot: number[] = [];
    let voxelRendererBound = false;
    runtime.addSystem("PRE_UPDATE", () => {
        if (!voxelRendererBound) {
            const voxelWorldRendererIface = runtime.getInterface<VoxelWorldRendererClientInterface>("voxel-world-renderer");
            if (voxelWorldRendererIface) {
                bindVoxelWorldRendererInterface(voxelWorldRendererIface);
                voxelRendererBound = true;
            }
        }

        const blockTypes = voxelWorldIface.getBlockTypes();
        const next = Array.from(blockTypes.keys())
            .filter((id) => Number.isInteger(id) && id > 0)
            .sort((a, b) => a - b);

        for (const blockId of next) {
            const blockType = blockTypes.get(blockId);
            if (!blockType) continue;

            setBlockMeta(blockId, {
                name: blockType.name ?? `Block ${blockId}`,
                textureUri: blockType.textureUri ?? "",
            });
        }

        if (next.length === snapshot.length && next.every((value, index) => value === snapshot[index])) return;
        snapshot = next;
        setBlockIds(next);
    });

    logger.info("Creative inventory game systems initialized");
}
