import { ClientPlugin, ClientRuntime } from "@core/client";
import { Logger } from "@core/shared/utils";
import type { VoxelWorldClientInterface } from "./game";
import type { VoxelWorldState } from "../shared";
import { VOXEL_WORLD_CHUNK_MESSAGE, VOXEL_WORLD_CHUNKS_DONE_MESSAGE, VOXEL_WORLD_BLOCK_UPDATES_MESSAGE } from "../shared/VoxelWorldState";
import type { PluginState } from "@core/shared";
import { VoxelWorldStore } from "./game/resources/VoxelWorldStore";
import type { BlockTypeInfo } from "./game/interfaces/VoxelWorldClientInterface";
import { VoxelWorldClientInterfaceImpl } from "./game/interfaces/VoxelWorldClientInterfaceImpl";

export type { VoxelWorldClientInterface };

type ConnectionLike = {
    room?: {
        onMessage(type: string, callback: (payload: unknown) => void): void;
    };
};

type ChunkPayload = {
    x: number;
    z: number;
    blocks: number[];
    highestEverBlockY: number;
    lowestEverBlockY: number;
};

const logger = new Logger("VoxelWorldClient");
export function PluginVoxelWorldClient() : ClientPlugin {
    return new ClientPlugin({
        id: "plugin-voxel-world",
        name: "Voxel World",
        version: "0.0.1",
        description: "Voxel world plugin",
        author: "Hytopia",
        dependencies: [],
        init: async (runtime: ClientRuntime, state: PluginState) => {
            const voxelWorldState = state as VoxelWorldState;
            if (!voxelWorldState) {
                logger.error("VoxelWorldState not found");
                return;
            }

            const store = new VoxelWorldStore();
            const blockTypes = new Map<number, BlockTypeInfo>();
            const voxelWorld = new VoxelWorldClientInterfaceImpl(store, blockTypes);

            for (const [idStr, bt] of voxelWorldState.blockTypes) {
                blockTypes.set(Number(idStr), {
                    name: bt.name,
                    textureUri: bt.textureUri,
                    isMultiTexture: bt.isMultiTexture,
                    transparent: bt.transparent,
                });
            }
            logger.info(`Loaded ${blockTypes.size} block types`);

            const connection = runtime.getInterface<ConnectionLike>("connection");
            const room = connection?.room;
            if (!room) {
                logger.error("No room connection available for chunk streaming");
                return;
            }

            room.onMessage(VOXEL_WORLD_CHUNK_MESSAGE, (payload: unknown) => {
                const chunk = payload as ChunkPayload;
                if (!chunk || typeof chunk.x !== "number" || typeof chunk.z !== "number" || !Array.isArray(chunk.blocks)) {
                    return;
                }

                voxelWorld.setChunkBlocksFromSparsePairs(
                    chunk.x,
                    chunk.z,
                    chunk.blocks,
                    chunk.highestEverBlockY,
                    chunk.lowestEverBlockY,
                );
            });

            room.onMessage(VOXEL_WORLD_CHUNKS_DONE_MESSAGE, (payload: unknown) => {
                const data = payload as { count?: number };
                logger.info(`Received ${data?.count ?? "?"} chunks from server`);
            });

            room.onMessage(VOXEL_WORLD_BLOCK_UPDATES_MESSAGE, (payload: unknown) => {
                const changes = payload as { x: number; y: number; z: number; blockId: number }[];
                if (!Array.isArray(changes)) return;
                for (const change of changes) {
                    voxelWorld.setBlock(change.x, change.y, change.z, change.blockId);
                }
            });

            runtime.addInterface("voxel-world", voxelWorld);
        }
    });
}
