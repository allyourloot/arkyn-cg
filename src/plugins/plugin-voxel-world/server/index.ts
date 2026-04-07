import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { gunzipSync, gzipSync } from "zlib";
import { ServerPlugin, ServerRuntime } from "@core/server";
import { Logger } from "@core/shared/utils";
import { BlockType, VoxelWorldState, VOXEL_WORLD_CHUNK_MESSAGE, VOXEL_WORLD_CHUNKS_DONE_MESSAGE, VOXEL_WORLD_BLOCK_UPDATES_MESSAGE } from "../shared/VoxelWorldState";
import { CHUNK_AREA, CHUNK_SIZE, CHUNK_VOLUME, VoxelWorld } from "../types/VoxelWorldServerResources";

const logger = new Logger("VoxelWorld");
const MAP_PATH = "assets/map.json";
const OPTIMIZED_MAP_PATH = "assets/__generated/voxel-world/map.optimized.json";

type RawBlockType = {
    id: number;
    name: string;
    textureUri: string;
    isMultiTexture?: boolean;
    transparent?: boolean;
};

type RawMap = {
    blockTypes: RawBlockType[];
    blocks: Record<string, number>;
};

type OptimizedMapChunk = {
    x: number;
    z: number;
    blocks: string;
};

type OptimizedMap = {
    version: 3;
    blockTypes: RawBlockType[];
    chunks: OptimizedMapChunk[];
};

type OptimizedMapChunkBuilder = {
    x: number;
    z: number;
    blocks: number[];
};

function encodeBlocks(blocks: number[]): string {
    const raw = Buffer.alloc(CHUNK_VOLUME * 4);
    for (let i = 0; i < CHUNK_VOLUME; i++) {
        raw.writeUInt32LE((blocks[i] ?? 0) >>> 0, i * 4);
    }
    return gzipSync(raw).toString("base64");
}

function decodeBlocks(encodedBlocks: string): number[] {
    try {
        const compressed = Buffer.from(encodedBlocks, "base64");
        const raw = gunzipSync(compressed);
        const blocks = Array(CHUNK_VOLUME).fill(0);
        const maxBlocks = Math.min(CHUNK_VOLUME, Math.floor(raw.length / 4));
        for (let i = 0; i < maxBlocks; i++) {
            blocks[i] = raw.readUInt32LE(i * 4);
        }
        return blocks;
    } catch {
        logger.warn("Failed to decode optimized chunk blocks; skipping chunk data");
        return Array(CHUNK_VOLUME).fill(0);
    }
}

function createOptimizedMap(rawMap: RawMap): OptimizedMap {
    let minY = Infinity;
    for (const coord of Object.keys(rawMap.blocks)) {
        const y = Number(coord.split(",")[1]);
        if (Number.isFinite(y) && y < minY) {
            minY = y;
        }
    }

    const yOffset = Number.isFinite(minY) && minY < 0 ? -minY : 0;
    if (yOffset !== 0) {
        logger.info(`Remapping Y levels by +${yOffset} (lowest Y was ${minY})`);
    }

    const chunks: Record<string, OptimizedMapChunkBuilder> = {};
    for (const [coord, blockId] of Object.entries(rawMap.blocks)) {
        if (typeof blockId !== "number") {
            continue;
        }

        const [x, rawY, z] = coord.split(",").map(Number);
        if (!Number.isFinite(x) || !Number.isFinite(rawY) || !Number.isFinite(z)) {
            continue;
        }

        const y = rawY + yOffset;
        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        const localX = x - chunkX * CHUNK_SIZE;
        const localZ = z - chunkZ * CHUNK_SIZE;
        const blockIndex = y * CHUNK_AREA + localZ * CHUNK_SIZE + localX;

        if (localX < 0 || localX >= CHUNK_SIZE || localZ < 0 || localZ >= CHUNK_SIZE) {
            continue;
        }
        if (blockIndex < 0 || blockIndex >= CHUNK_VOLUME) {
            continue;
        }

        const chunkKey = `${chunkX},${chunkZ}`;

        let chunk = chunks[chunkKey];
        if (!chunk) {
            chunk = {
                x: chunkX,
                z: chunkZ,
                blocks: Array(CHUNK_VOLUME).fill(0),
            };
            chunks[chunkKey] = chunk;
        }

        chunk.blocks[blockIndex] = blockId;
    }

    const chunkList = Object.values(chunks)
        .sort((a, b) => (a.x - b.x) || (a.z - b.z))
        .map((chunk) => ({
            x: chunk.x,
            z: chunk.z,
            blocks: encodeBlocks(chunk.blocks),
        }));

    return {
        version: 3,
        blockTypes: rawMap.blockTypes,
        chunks: chunkList
    };
}

function isOptimizedMapV3(value: unknown): value is OptimizedMap {
    if (!value || typeof value !== "object") {
        return false;
    }

    const map = value as Partial<OptimizedMap>;
    if (map.version !== 3 || !Array.isArray(map.blockTypes) || !Array.isArray(map.chunks)) {
        return false;
    }

    return map.chunks.every((chunk) => (
        typeof chunk?.x === "number"
        && typeof chunk?.z === "number"
        && typeof chunk?.blocks === "string"
    ));
}

function getOptimizedMap(): OptimizedMap {
    if (existsSync(OPTIMIZED_MAP_PATH)) {
        const optimizedMapStr = readFileSync(OPTIMIZED_MAP_PATH, "utf8");
        const optimizedMap = JSON.parse(optimizedMapStr) as unknown;
        if (isOptimizedMapV3(optimizedMap)) {
            logger.info(`Loaded optimized voxel map from ${OPTIMIZED_MAP_PATH}`);
            return optimizedMap;
        }

        logger.info(`Optimized map format is outdated; regenerating ${OPTIMIZED_MAP_PATH}`);
    }

    const rawMapStr = readFileSync(MAP_PATH, "utf8");
    const rawMap = JSON.parse(rawMapStr) as RawMap;
    const optimizedMap = createOptimizedMap(rawMap);
    mkdirSync(dirname(OPTIMIZED_MAP_PATH), { recursive: true });
    writeFileSync(OPTIMIZED_MAP_PATH, JSON.stringify(optimizedMap));
    logger.info(`Created optimized voxel map at ${OPTIMIZED_MAP_PATH}`);
    return optimizedMap;
}

function buildSparsePairs(blocks: number[]): number[] {
    const pairs: number[] = [];
    const maxBlockCount = Math.min(blocks.length, CHUNK_VOLUME);
    for (let i = 0; i < maxBlockCount; i++) {
        const id = blocks[i];
        if (id !== 0) {
            pairs.push(i, id);
        }
    }
    return pairs;
}

export function PluginVoxelWorldServer() : ServerPlugin {
    return new ServerPlugin({
        id: "plugin-voxel-world",
        name: "Voxel World",
        version: "0.0.1",
        description: "Voxel world plugin",
        author: "Hytopia",
        dependencies: [],
        init: async (runtime: ServerRuntime) => {
            const state = new VoxelWorldState();
            const world = new VoxelWorld();
            const map = getOptimizedMap();

            for (const blockType of map.blockTypes) {
                const blockTypeSchema = new BlockType();
                blockTypeSchema.name = blockType.name;
                blockTypeSchema.textureUri = blockType.textureUri;
                blockTypeSchema.isMultiTexture = Boolean(blockType.isMultiTexture);
                blockTypeSchema.transparent = Boolean(blockType.transparent);
                state.blockTypes.set(blockType.id.toString(), blockTypeSchema);
            }
            logger.info(`Loaded ${state.blockTypes.size} block types`);

            for (const chunkData of map.chunks) {
                const decodedBlocks = decodeBlocks(chunkData.blocks);
                const maxBlockCount = Math.min(decodedBlocks.length, CHUNK_VOLUME);
                for (let blockIndex = 0; blockIndex < maxBlockCount; blockIndex++) {
                    const blockId = decodedBlocks[blockIndex];
                    if (typeof blockId !== "number" || blockId === 0) {
                        continue;
                    }

                    const y = Math.floor(blockIndex / CHUNK_AREA);
                    const layerIndex = blockIndex % CHUNK_AREA;
                    const localZ = Math.floor(layerIndex / CHUNK_SIZE);
                    const localX = layerIndex % CHUNK_SIZE;
                    const x = chunkData.x * CHUNK_SIZE + localX;
                    const z = chunkData.z * CHUNK_SIZE + localZ;
                    world.setBlock(x, y, z, blockId);
                }
            }
            logger.info(`Loaded ${Object.keys(world.chunks).length} chunks into memory`);
            world.drainPendingChanges();

            type RoomLike = { broadcast(type: string, payload: unknown): void };
            let room: RoomLike | null = null;

            runtime.onClientJoin((client, _auth, joinedRoom) => {
                room = joinedRoom as RoomLike;

                const chunks = Object.values(world.chunks);
                for (const chunk of chunks) {
                    client.send(VOXEL_WORLD_CHUNK_MESSAGE, {
                        x: chunk.x,
                        z: chunk.z,
                        blocks: buildSparsePairs(chunk.blocks),
                        highestEverBlockY: chunk.highestEverBlockY,
                        lowestEverBlockY: chunk.lowestEverBlockY,
                    });
                }
                client.send(VOXEL_WORLD_CHUNKS_DONE_MESSAGE, { count: chunks.length });
            });

            runtime.addSystem("POST_UPDATE", () => {
                const changes = world.drainPendingChanges();
                if (changes.length === 0 || !room) return;
                room.broadcast(VOXEL_WORLD_BLOCK_UPDATES_MESSAGE, changes);
            });

            runtime.addInterface("voxel-world", world);
            return state;
        }
    });
}
