export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 256;
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE;
export const SECTION_HEIGHT = 16;
export const SECTION_COUNT = CHUNK_HEIGHT / SECTION_HEIGHT;
export const SECTION_VOLUME = CHUNK_SIZE * SECTION_HEIGHT * CHUNK_SIZE;

export type ChunkData = {
    blocks: number[];
    heightmap: number[];
    highestEverBlockY: number;
    lowestEverBlockY: number;
};

export type NeighborChunks = {
    px?: ChunkData;
    nx?: ChunkData;
    pz?: ChunkData;
    nz?: ChunkData;
    pxpz?: ChunkData;
    pxnz?: ChunkData;
    nxpz?: ChunkData;
    nxnz?: ChunkData;
};

export type ComputeLightingRequest = {
    type: "computeLighting";
    requestId: number;
    chunkIndex: number;
    chunkX: number;
    chunkZ: number;
    sectionIndexes: number[];
    blocks: number[];
    heightmap: number[];
    highestEverBlockY: number;
    lowestEverBlockY: number;
    neighbors: NeighborChunks;
    transparentBlockIds: number[];
};

export type LightingResultResponse = {
    type: "lightingResult";
    requestId: number;
    chunkIndex: number;
    sectionIndexes: number[];
    sunLightSections: Uint8Array;
};

export type LightingWorkerMessage = ComputeLightingRequest;
export type LightingWorkerResponse = LightingResultResponse;
