import { ServerPlugin, type ServerRuntime } from "@core/server";
import { Logger } from "@core/shared/utils";
import {
    BLOCK_INTERACTION_DESTROY_MESSAGE,
    BLOCK_INTERACTION_PLACE_MESSAGE,
    BlockInteractionState,
} from "../shared";

const logger = new Logger("BlockInteractionServer");

type RoomLike = {
    state: {
        plugins: {
            get(id: string): unknown;
        };
    };
};

type VoxelWorldLike = {
    getBlock(x: number, y: number, z: number): number;
    setBlock(x: number, y: number, z: number, id: number): void;
};

type VoxelWorldStateLike = {
    blockTypes: { has(key: string): boolean };
};

type HotbarStateLike = {
    players: {
        get(sessionId: string): { slots: number[]; selectedSlot: number } | undefined;
    };
};

type BlockTarget = { x: number; y: number; z: number };
type PlaceTarget = BlockTarget & { blockId: number };

function parseTargetPayload(payload: unknown): BlockTarget | null {
    const parsed = payload !== null && typeof payload === "object"
        ? payload as { x?: unknown; y?: unknown; z?: unknown }
        : null;
    const x = Number(parsed?.x);
    const y = Number(parsed?.y);
    const z = Number(parsed?.z);
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) return null;
    return { x, y, z };
}

function parsePlacePayload(payload: unknown): PlaceTarget | null {
    const parsed = payload !== null && typeof payload === "object"
        ? payload as { blockId?: unknown }
        : null;
    const target = parseTargetPayload(payload);
    const blockId = Number(parsed?.blockId);
    if (!target || !Number.isInteger(blockId) || blockId <= 0) return null;
    return { ...target, blockId };
}

function handleDestroyBlock(runtime: ServerRuntime, payload: unknown) {
    const parsed = parseTargetPayload(payload);
    if (!parsed) return;

    const world = runtime.getInterface<VoxelWorldLike>("voxel-world");
    if (!world || world.getBlock(parsed.x, parsed.y, parsed.z) === 0) return;

    world.setBlock(parsed.x, parsed.y, parsed.z, 0);
}

function handlePlaceBlock(runtime: ServerRuntime, client: { sessionId: string }, payload: unknown, room: RoomLike) {
    const voxelWorldState = room.state.plugins.get("plugin-voxel-world") as VoxelWorldStateLike | undefined;
    const hotbarState = room.state.plugins.get("plugin-simple-hotbar") as HotbarStateLike | undefined;
    if (!voxelWorldState || !hotbarState) return;

    const parsed = parsePlacePayload(payload);
    if (!parsed) return;
    if (!voxelWorldState.blockTypes.has(`${parsed.blockId}`)) return;

    const world = runtime.getInterface<VoxelWorldLike>("voxel-world");
    if (!world || world.getBlock(parsed.x, parsed.y, parsed.z) !== 0) return;

    const playerHotbar = hotbarState.players.get(client.sessionId);
    if (!playerHotbar) return;
    const selectedBlockId = playerHotbar.slots[playerHotbar.selectedSlot] ?? 0;
    if (selectedBlockId !== parsed.blockId) return;

    world.setBlock(parsed.x, parsed.y, parsed.z, parsed.blockId);
}

export function PluginBlockInteractionServer(): ServerPlugin {
    return new ServerPlugin({
        id: "plugin-block-interaction",
        name: "Block Interaction",
        version: "0.0.1",
        description: "Allows players to break and place blocks by clicking.",
        author: "Matt (@matt)",
        dependencies: ["plugin-voxel-world", "plugin-simple-hotbar"],
        init: async (runtime: ServerRuntime) => {
            const state = new BlockInteractionState();

            runtime.onMessage(BLOCK_INTERACTION_DESTROY_MESSAGE, (_client, payload) => {
                handleDestroyBlock(runtime, payload);
            });

            runtime.onMessage(BLOCK_INTERACTION_PLACE_MESSAGE, (client, payload, room) => {
                handlePlaceBlock(runtime, client, payload, room as RoomLike);
            });

            logger.info("Block interaction server plugin initialized");
            return state;
        },
    });
}
