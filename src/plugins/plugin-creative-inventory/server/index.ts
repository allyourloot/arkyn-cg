import { ServerPlugin, type ServerRuntime } from "@core/server";
import { PluginState } from "@core/shared";
import { Logger } from "@core/shared/utils";
import { HOTBAR_SET_ITEM_MESSAGE } from "../shared";

const logger = new Logger("CreativeInventoryServer");
const HOTBAR_SIZE = 9;

type RoomWithState = {
    state: {
        plugins: {
            get(id: string): unknown;
        };
    };
};

type VoxelWorldLike = {
    blockTypes: {
        has(key: string): boolean;
    };
};

type PlayerHotbarLike = {
    slots: number[];
    selectedSlot: number;
};

type HotbarStateLike = {
    players: {
        get(sessionId: string): PlayerHotbarLike | undefined;
        set(sessionId: string, state: unknown): void;
    };
};

export function PluginCreativeInventoryServer(): ServerPlugin {
    return new ServerPlugin({
        id: "plugin-creative-inventory",
        name: "Creative Inventory",
        version: "0.0.1",
        description: "Assign voxel blocks to hotbar slots from a creative inventory",
        author: "Hytopia",
        dependencies: ["plugin-simple-hotbar", "plugin-voxel-world"],
        init: async (runtime: ServerRuntime) => {
            const state = new PluginState();
            runtime.onMessage(HOTBAR_SET_ITEM_MESSAGE, (client, payload, room) => {
                const parsed = payload !== null && typeof payload === "object"
                    ? (payload as { slot?: unknown; blockId?: unknown })
                    : null;
                const slot = Number(parsed?.slot);
                const blockId = Number(parsed?.blockId);
                if (!Number.isInteger(slot) || slot < 0 || slot >= HOTBAR_SIZE) return;
                if (!Number.isInteger(blockId) || blockId <= 0) return;

                const gameRoom = room as RoomWithState;
                const voxelWorldState = gameRoom.state.plugins.get("plugin-voxel-world") as VoxelWorldLike | undefined;
                if (!voxelWorldState?.blockTypes.has(`${blockId}`)) return;

                const hotbarState = gameRoom.state.plugins.get("plugin-simple-hotbar") as HotbarStateLike | undefined;
                if (!hotbarState) return;

                const playerState = hotbarState.players.get(client.sessionId);
                if (!playerState) return;

                playerState.slots[slot] = blockId;
            });

            logger.info("Creative inventory server plugin initialized");
            return state;
        },
    });
}
