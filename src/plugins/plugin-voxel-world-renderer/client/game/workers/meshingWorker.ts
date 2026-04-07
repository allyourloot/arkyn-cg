import type { BlockFace, BlockFaceUvs, UvRect } from "../resources/TextureAtlas";
import type { MeshingWorkerMessage, MeshingWorkerResponse, NeighborChunkBlocks, NeighborChunkSunlight } from "./meshingWorkerTypes";
import {
    CHUNK_AREA,
    CHUNK_HEIGHT,
    CHUNK_SIZE,
    SECTION_COUNT,
} from "./meshingWorkerTypes";

type FaceDefinition = {
    dir: readonly [number, number, number];
    corners: readonly (readonly [number, number, number])[];
    face: BlockFace;
    shade: number;
};

const EAST_WEST_SHADE = 1;
const MAX_SUNLIGHT = 15;
const FALLBACK_UV: UvRect = { uMin: 0, vMin: 0, uMax: 1, vMax: 1 };

const FACES: FaceDefinition[] = [
    { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], face: "PX", shade: EAST_WEST_SHADE },
    { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], face: "NX", shade: EAST_WEST_SHADE },
    { dir: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], face: "PY", shade: 1 },
    { dir: [0, -1, 0], corners: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]], face: "NY", shade: 1 },
    { dir: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], face: "PZ", shade: 1 },
    { dir: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], face: "NZ", shade: 1 },
];

type Vec3 = [number, number, number];
type AOVertexNeighbors = [Vec3, Vec3, Vec3];
type AOFaceNeighbors = [AOVertexNeighbors, AOVertexNeighbors, AOVertexNeighbors, AOVertexNeighbors];

const AO_FACE_NEIGHBORS: Record<BlockFace, AOFaceNeighbors> = {
    PX: [
        [[1, -1, 0], [1, 0, -1], [1, -1, -1]],
        [[1, 1, 0], [1, 0, -1], [1, 1, -1]],
        [[1, 1, 0], [1, 0, 1], [1, 1, 1]],
        [[1, -1, 0], [1, 0, 1], [1, -1, 1]],
    ],
    NX: [
        [[-1, -1, 0], [-1, 0, 1], [-1, -1, 1]],
        [[-1, 1, 0], [-1, 0, 1], [-1, 1, 1]],
        [[-1, 1, 0], [-1, 0, -1], [-1, 1, -1]],
        [[-1, -1, 0], [-1, 0, -1], [-1, -1, -1]],
    ],
    PY: [
        [[-1, 1, 0], [0, 1, -1], [-1, 1, -1]],
        [[-1, 1, 0], [0, 1, 1], [-1, 1, 1]],
        [[1, 1, 0], [0, 1, 1], [1, 1, 1]],
        [[1, 1, 0], [0, 1, -1], [1, 1, -1]],
    ],
    NY: [
        [[-1, -1, 0], [0, -1, -1], [-1, -1, -1]],
        [[1, -1, 0], [0, -1, -1], [1, -1, -1]],
        [[1, -1, 0], [0, -1, 1], [1, -1, 1]],
        [[-1, -1, 0], [0, -1, 1], [-1, -1, 1]],
    ],
    PZ: [
        [[1, 0, 1], [0, -1, 1], [1, -1, 1]],
        [[1, 0, 1], [0, 1, 1], [1, 1, 1]],
        [[-1, 0, 1], [0, 1, 1], [-1, 1, 1]],
        [[-1, 0, 1], [0, -1, 1], [-1, -1, 1]],
    ],
    NZ: [
        [[-1, 0, -1], [0, -1, -1], [-1, -1, -1]],
        [[-1, 0, -1], [0, 1, -1], [-1, 1, -1]],
        [[1, 0, -1], [0, 1, -1], [1, 1, -1]],
        [[1, 0, -1], [0, -1, -1], [1, -1, -1]],
    ],
};

const blockRenderConfigs = new Map<number, BlockFaceUvs>();

function getNeighborKey(cx: number, cz: number): keyof NeighborChunkBlocks | null {
    if (cx === 1 && cz === 0) return "px";
    if (cx === -1 && cz === 0) return "nx";
    if (cx === 0 && cz === 1) return "pz";
    if (cx === 0 && cz === -1) return "nz";
    if (cx === 1 && cz === 1) return "pxpz";
    if (cx === 1 && cz === -1) return "pxnz";
    if (cx === -1 && cz === 1) return "nxpz";
    if (cx === -1 && cz === -1) return "nxnz";
    return null;
}

function readChunkBlock(blocks: number[] | undefined, lx: number, ly: number, lz: number): number {
    if (!blocks || ly < 0 || ly >= CHUNK_HEIGHT) return 0;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return 0;
    return blocks[ly * CHUNK_AREA + lz * CHUNK_SIZE + lx] ?? 0;
}

function getBlockAtLocal(
    centerBlocks: number[],
    neighborBlocks: NeighborChunkBlocks,
    lx: number,
    ly: number,
    lz: number,
): number {
    if (ly < 0 || ly >= CHUNK_HEIGHT) return 0;

    const cx = lx < 0 ? -1 : lx >= CHUNK_SIZE ? 1 : 0;
    const cz = lz < 0 ? -1 : lz >= CHUNK_SIZE ? 1 : 0;

    if (cx === 0 && cz === 0) {
        return readChunkBlock(centerBlocks, lx, ly, lz);
    }

    const key = getNeighborKey(cx, cz);
    if (!key) return 0;
    const neighbor = neighborBlocks[key];
    const nlx = lx - cx * CHUNK_SIZE;
    const nlz = lz - cz * CHUNK_SIZE;
    return readChunkBlock(neighbor, nlx, ly, nlz);
}

function readChunkSunlight(sunlight: Uint8Array | undefined, lx: number, ly: number, lz: number): number {
    if (!sunlight || ly < 0 || ly >= CHUNK_HEIGHT) return MAX_SUNLIGHT;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return MAX_SUNLIGHT;
    return sunlight[ly * CHUNK_AREA + lz * CHUNK_SIZE + lx] ?? MAX_SUNLIGHT;
}

function getSunlightAtLocal(
    centerSunlight: Uint8Array | undefined,
    neighborSunlight: NeighborChunkSunlight,
    lx: number,
    ly: number,
    lz: number,
): number {
    if (ly < 0 || ly >= CHUNK_HEIGHT) return MAX_SUNLIGHT;

    const cx = lx < 0 ? -1 : lx >= CHUNK_SIZE ? 1 : 0;
    const cz = lz < 0 ? -1 : lz >= CHUNK_SIZE ? 1 : 0;

    if (cx === 0 && cz === 0) {
        return readChunkSunlight(centerSunlight, lx, ly, lz);
    }

    const key = getNeighborKey(cx, cz);
    if (!key) return MAX_SUNLIGHT;
    const neighbor = neighborSunlight[key];
    const nlx = lx - cx * CHUNK_SIZE;
    const nlz = lz - cz * CHUNK_SIZE;
    return readChunkSunlight(neighbor, nlx, ly, nlz);
}

function vertexAO(side1: boolean, side2: boolean, corner: boolean): number {
    if (side1 && side2) return 0;
    return 3 - (Number(side1) + Number(side2) + Number(corner));
}

function computeFaceAO(
    centerBlocks: number[],
    neighborBlocks: NeighborChunkBlocks,
    lx: number,
    ly: number,
    lz: number,
    face: BlockFace,
): [number, number, number, number] {
    const neighbors = AO_FACE_NEIGHBORS[face];
    const result: [number, number, number, number] = [0, 0, 0, 0];

    for (let i = 0; i < 4; i++) {
        const offsets = neighbors[i];
        const s1 = getBlockAtLocal(centerBlocks, neighborBlocks, lx + offsets[0][0], ly + offsets[0][1], lz + offsets[0][2]) !== 0;
        const s2 = getBlockAtLocal(centerBlocks, neighborBlocks, lx + offsets[1][0], ly + offsets[1][1], lz + offsets[1][2]) !== 0;
        const c = getBlockAtLocal(centerBlocks, neighborBlocks, lx + offsets[2][0], ly + offsets[2][1], lz + offsets[2][2]) !== 0;
        result[i] = vertexAO(s1, s2, c);
    }

    return result;
}

function computeFaceSunlight(
    centerSunlight: Uint8Array | undefined,
    neighborSunlight: NeighborChunkSunlight,
    lx: number,
    ly: number,
    lz: number,
    dir: readonly [number, number, number],
    corners: readonly (readonly [number, number, number])[],
): [number, number, number, number] {
    const [dx, dy, dz] = dir;
    const normalAxis = dx !== 0 ? 0 : dy !== 0 ? 1 : 2;
    const base: [number, number, number] = [lx + dx, ly + dy, lz + dz];
    const result: [number, number, number, number] = [0, 0, 0, 0];

    for (let i = 0; i < 4; i++) {
        const corner = corners[i];
        const ranges: [number, number][] = [
            [0, 0],
            [0, 0],
            [0, 0],
        ];

        for (let axis = 0; axis < 3; axis++) {
            if (axis === normalAxis) continue;
            const c = corner[axis];
            ranges[axis] = [c - 1, c];
        }

        let maxSample = 0;
        if (normalAxis === 0) {
            for (let oy = ranges[1][0]; oy <= ranges[1][1]; oy++) {
                for (let oz = ranges[2][0]; oz <= ranges[2][1]; oz++) {
                    maxSample = Math.max(
                        maxSample,
                        getSunlightAtLocal(centerSunlight, neighborSunlight, base[0], base[1] + oy, base[2] + oz),
                    );
                }
            }
        } else if (normalAxis === 1) {
            for (let ox = ranges[0][0]; ox <= ranges[0][1]; ox++) {
                for (let oz = ranges[2][0]; oz <= ranges[2][1]; oz++) {
                    maxSample = Math.max(
                        maxSample,
                        getSunlightAtLocal(centerSunlight, neighborSunlight, base[0] + ox, base[1], base[2] + oz),
                    );
                }
            }
        } else {
            for (let ox = ranges[0][0]; ox <= ranges[0][1]; ox++) {
                for (let oy = ranges[1][0]; oy <= ranges[1][1]; oy++) {
                    maxSample = Math.max(
                        maxSample,
                        getSunlightAtLocal(centerSunlight, neighborSunlight, base[0] + ox, base[1] + oy, base[2]),
                    );
                }
            }
        }

        result[i] = maxSample / MAX_SUNLIGHT;
    }

    return result;
}

self.onmessage = (e: MessageEvent<MeshingWorkerMessage>) => {
    const msg = e.data;

    if (msg.type === "initBlockRenderConfigs") {
        blockRenderConfigs.clear();
        for (const [id, uvs] of msg.entries) {
            blockRenderConfigs.set(id, uvs);
        }
        return;
    }

    const sectionIndexes = Array.from(new Set(msg.sectionIndexes))
        .filter(sectionIndex => sectionIndex >= 0 && sectionIndex < SECTION_COUNT)
        .sort((a, b) => a - b);
    const transparentIds = new Set(msg.transparentBlockIds);
    const clampedHighestEverBlockY = Math.max(-1, Math.min(CHUNK_HEIGHT - 1, msg.highestEverBlockY));
    const clampedLowestEverBlockY = Math.max(-1, Math.min(CHUNK_HEIGHT - 1, msg.lowestEverBlockY));
    const hasEverBlocks =
        clampedHighestEverBlockY >= 0 &&
        clampedLowestEverBlockY >= 0 &&
        clampedLowestEverBlockY <= clampedHighestEverBlockY;

    const positions: number[] = [];
    const uvs: number[] = [];
    const uvBoundsMinValues: number[] = [];
    const uvBoundsMaxValues: number[] = [];
    const aoValues: number[] = [];
    const shadeValues: number[] = [];
    const sunlightValues: number[] = [];
    const indices: number[] = [];
    let vertexOffset = 0;

    if (hasEverBlocks) {
        for (const sectionIndex of sectionIndexes) {
            const yStart = sectionIndex * 16;
            const yEnd = yStart + 16;
            const yMin = Math.max(yStart, clampedLowestEverBlockY);
            const yMaxExclusive = Math.min(yEnd, clampedHighestEverBlockY + 1);
            if (yMaxExclusive <= yMin) {
                continue;
            }

            for (let ly = yMin; ly < yMaxExclusive; ly++) {
                for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                        const blockId = msg.chunkBlocks[ly * CHUNK_AREA + lz * CHUNK_SIZE + lx] ?? 0;
                        if (blockId === 0) continue;

                        const faceUvs = blockRenderConfigs.get(blockId);

                        for (const { dir, corners, face, shade } of FACES) {
                            const [dx, dy, dz] = dir;
                            const neighborBlockId = getBlockAtLocal(
                                msg.chunkBlocks,
                                msg.neighborBlocks,
                                lx + dx,
                                ly + dy,
                                lz + dz,
                            );
                            if (neighborBlockId !== 0 && !transparentIds.has(neighborBlockId)) {
                                continue;
                            }

                            const uvRect = faceUvs?.[face] ?? FALLBACK_UV;
                            const faceAO = computeFaceAO(msg.chunkBlocks, msg.neighborBlocks, lx, ly, lz, face);
                            const faceSunlight = computeFaceSunlight(
                                msg.chunkSunlight,
                                msg.neighborSunlight,
                                lx,
                                ly,
                                lz,
                                dir,
                                corners,
                            );

                            for (const [cx, cy, cz] of corners) {
                                positions.push(lx + cx, ly + cy, lz + cz);
                            }

                            uvs.push(
                                uvRect.uMax, uvRect.vMax,
                                uvRect.uMax, uvRect.vMin,
                                uvRect.uMin, uvRect.vMin,
                                uvRect.uMin, uvRect.vMax,
                            );

                            for (let i = 0; i < faceAO.length; i++) {
                                uvBoundsMinValues.push(uvRect.uMin, uvRect.vMin);
                                uvBoundsMaxValues.push(uvRect.uMax, uvRect.vMax);
                                aoValues.push(faceAO[i] / 3);
                                shadeValues.push(shade);
                                sunlightValues.push(faceSunlight[i]);
                            }

                            const v = vertexOffset;
                            if (faceAO[0] + faceAO[2] > faceAO[1] + faceAO[3]) {
                                indices.push(v, v + 1, v + 3, v + 1, v + 2, v + 3);
                            } else {
                                indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
                            }
                            vertexOffset += 4;
                        }
                    }
                }
            }
        }
    }

    const response: MeshingWorkerResponse = positions.length === 0
        ? {
            type: "chunkMeshResult",
            requestId: msg.requestId,
            chunkIndex: msg.chunkIndex,
            hasGeometry: false,
        }
        : {
            type: "chunkMeshResult",
            requestId: msg.requestId,
            chunkIndex: msg.chunkIndex,
            hasGeometry: true,
            positions: new Float32Array(positions),
            uvs: new Float32Array(uvs),
            uvBoundsMin: new Float32Array(uvBoundsMinValues),
            uvBoundsMax: new Float32Array(uvBoundsMaxValues),
            ao: new Float32Array(aoValues),
            shade: new Float32Array(shadeValues),
            sunlight: new Float32Array(sunlightValues),
            indices: new Uint32Array(indices),
        };

    const transferables: Transferable[] = [];
    if (response.positions) transferables.push(response.positions.buffer);
    if (response.uvs) transferables.push(response.uvs.buffer);
    if (response.uvBoundsMin) transferables.push(response.uvBoundsMin.buffer);
    if (response.uvBoundsMax) transferables.push(response.uvBoundsMax.buffer);
    if (response.ao) transferables.push(response.ao.buffer);
    if (response.shade) transferables.push(response.shade.buffer);
    if (response.sunlight) transferables.push(response.sunlight.buffer);
    if (response.indices) transferables.push(response.indices.buffer);

    (self as unknown as Worker).postMessage(response, transferables);
};
