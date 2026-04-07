import type { BlockFaceUvs } from "../resources/TextureAtlas";

export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 256;
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
export const SECTION_HEIGHT = 16;
export const SECTION_COUNT = CHUNK_HEIGHT / SECTION_HEIGHT;

export type NeighborChunkBlocks = {
    px?: number[];
    nx?: number[];
    pz?: number[];
    nz?: number[];
    pxpz?: number[];
    pxnz?: number[];
    nxpz?: number[];
    nxnz?: number[];
};

export type NeighborChunkSunlight = {
    px?: Uint8Array;
    nx?: Uint8Array;
    pz?: Uint8Array;
    nz?: Uint8Array;
    pxpz?: Uint8Array;
    pxnz?: Uint8Array;
    nxpz?: Uint8Array;
    nxnz?: Uint8Array;
};

export type InitMeshingWorkerRequest = {
    type: "initBlockRenderConfigs";
    entries: Array<[number, BlockFaceUvs]>;
};

export type ComputeChunkMeshRequest = {
    type: "computeChunkMesh";
    requestId: number;
    chunkIndex: number;
    sectionIndexes: number[];
    chunkBlocks: number[];
    highestEverBlockY: number;
    lowestEverBlockY: number;
    transparentBlockIds: number[];
    neighborBlocks: NeighborChunkBlocks;
    chunkSunlight?: Uint8Array;
    neighborSunlight: NeighborChunkSunlight;
};

export type ChunkMeshResultResponse = {
    type: "chunkMeshResult";
    requestId: number;
    chunkIndex: number;
    hasGeometry: boolean;
    positions?: Float32Array;
    uvs?: Float32Array;
    uvBoundsMin?: Float32Array;
    uvBoundsMax?: Float32Array;
    ao?: Float32Array;
    shade?: Float32Array;
    sunlight?: Float32Array;
    indices?: Uint32Array;
};

export type MeshingWorkerMessage = InitMeshingWorkerRequest | ComputeChunkMeshRequest;
export type MeshingWorkerResponse = ChunkMeshResultResponse;
