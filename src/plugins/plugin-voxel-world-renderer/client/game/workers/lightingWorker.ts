import type { ChunkData, LightingWorkerMessage, LightingWorkerResponse, NeighborChunks } from "./lightingWorkerTypes";
import {
    CHUNK_SIZE,
    CHUNK_HEIGHT,
    CHUNK_AREA,
    CHUNK_VOLUME,
    SECTION_COUNT,
    SECTION_HEIGHT,
    SECTION_VOLUME,
} from "./lightingWorkerTypes";

const MAX_SUNLIGHT = 15;
const TRANSPARENT_BLOCK_PENALTY = 2;
const GRID_SIZE = CHUNK_SIZE * 3;
const GRID_AREA = GRID_SIZE * GRID_SIZE;

const NEIGHBOR_OFFSETS: readonly [number, number, number][] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
];

function buildGrid(center: ChunkData, neighbors: NeighborChunks): (ChunkData | undefined)[] {
    const grid: (ChunkData | undefined)[] = new Array(9);
    grid[0 * 3 + 0] = neighbors.nxnz;
    grid[0 * 3 + 1] = neighbors.nx;
    grid[0 * 3 + 2] = neighbors.nxpz;
    grid[1 * 3 + 0] = neighbors.nz;
    grid[1 * 3 + 1] = center;
    grid[1 * 3 + 2] = neighbors.pz;
    grid[2 * 3 + 0] = neighbors.pxnz;
    grid[2 * 3 + 1] = neighbors.px;
    grid[2 * 3 + 2] = neighbors.pxpz;
    return grid;
}

function gridGetBlock(grid: (ChunkData | undefined)[], px: number, y: number, pz: number): number {
    if (y < 0 || y >= CHUNK_HEIGHT) return 0;
    const gx = (px / CHUNK_SIZE) | 0;
    const gz = (pz / CHUNK_SIZE) | 0;
    if (gx < 0 || gx >= 3 || gz < 0 || gz >= 3) return 0;
    const chunk = grid[gx * 3 + gz];
    if (!chunk) return 0;
    const lx = px - gx * CHUNK_SIZE;
    const lz = pz - gz * CHUNK_SIZE;
    return chunk.blocks[y * CHUNK_AREA + lz * CHUNK_SIZE + lx];
}

function getClampedChunkYBounds(chunk: ChunkData): { highest: number; lowest: number } {
    const highest = Math.max(-1, Math.min(CHUNK_HEIGHT - 1, chunk.highestEverBlockY));
    const lowest = Math.max(-1, Math.min(CHUNK_HEIGHT - 1, chunk.lowestEverBlockY));
    if (highest < 0 || lowest < 0 || lowest > highest) {
        return { highest: -1, lowest: -1 };
    }
    return { highest, lowest };
}

function computeSunLight(center: ChunkData, neighbors: NeighborChunks, transparentIds: Set<number>): Uint8Array {
    const grid = buildGrid(center, neighbors);
    const sunLight = new Uint8Array(GRID_SIZE * CHUNK_HEIGHT * GRID_SIZE);

    let maxHeight = -1;
    for (let gz = 0; gz < 3; gz++) {
        for (let gx = 0; gx < 3; gx++) {
            const chunk = grid[gx * 3 + gz];
            if (!chunk) continue;
            const ox = gx * CHUNK_SIZE;
            const oz = gz * CHUNK_SIZE;

            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                    const topY = chunk.heightmap[lz * CHUNK_SIZE + lx];
                    if (topY > maxHeight) maxHeight = topY;
                    const px = ox + lx;
                    const pz = oz + lz;
                    const { highest: highestEverBlockY, lowest: lowestEverBlockY } = getClampedChunkYBounds(chunk);

                    let level = MAX_SUNLIGHT;
                    if (highestEverBlockY === -1) {
                        for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
                            sunLight[y * GRID_AREA + pz * GRID_SIZE + px] = level;
                        }
                        continue;
                    }

                    for (let y = CHUNK_HEIGHT - 1; y > highestEverBlockY; y--) {
                        sunLight[y * GRID_AREA + pz * GRID_SIZE + px] = level;
                    }

                    for (let y = highestEverBlockY; y >= lowestEverBlockY; y--) {
                        const blockId = chunk.blocks[y * CHUNK_AREA + lz * CHUNK_SIZE + lx];
                        if (blockId !== 0) {
                            if (transparentIds.has(blockId)) {
                                level = Math.max(level - TRANSPARENT_BLOCK_PENALTY, 0);
                            } else {
                                level = 0;
                            }
                        }
                        if (level > 0) {
                            sunLight[y * GRID_AREA + pz * GRID_SIZE + px] = level;
                        }
                    }

                    if (level > 0) {
                        for (let y = lowestEverBlockY - 1; y >= 0; y--) {
                            sunLight[y * GRID_AREA + pz * GRID_SIZE + px] = level;
                        }
                    }
                }
            }
        }
    }

    const queue: number[] = [];
    const scanCeil = Math.min(maxHeight + 1, CHUNK_HEIGHT);

    for (let gz = 0; gz < 3; gz++) {
        for (let gx = 0; gx < 3; gx++) {
            const chunk = grid[gx * 3 + gz];
            if (!chunk) continue;
            const ox = gx * CHUNK_SIZE;
            const oz = gz * CHUNK_SIZE;

            for (let lz = 0; lz < CHUNK_SIZE; lz++) {
                for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                    const px = ox + lx;
                    const pz = oz + lz;

                    for (let y = 0; y < scanCeil; y++) {
                        const idx = y * GRID_AREA + pz * GRID_SIZE + px;
                        if (sunLight[idx] <= 1) continue;
                        for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
                            const npx = px + dx;
                            const ny = y + dy;
                            const npz = pz + dz;
                            if (npx < 0 || npx >= GRID_SIZE || ny < 0 || ny >= CHUNK_HEIGHT || npz < 0 || npz >= GRID_SIZE) continue;
                            const nBlock = gridGetBlock(grid, npx, ny, npz);
                            if (nBlock !== 0 && !transparentIds.has(nBlock)) continue;
                            if (sunLight[ny * GRID_AREA + npz * GRID_SIZE + npx] >= sunLight[idx] - 1) continue;
                            queue.push(idx);
                            break;
                        }
                    }
                }
            }
        }
    }

    let head = 0;
    while (head < queue.length) {
        const idx = queue[head++];
        const light = sunLight[idx];
        if (light <= 1) continue;

        const y = (idx / GRID_AREA) | 0;
        const rem = idx - y * GRID_AREA;
        const pz = (rem / GRID_SIZE) | 0;
        const px = rem - pz * GRID_SIZE;

        for (const [dx, dy, dz] of NEIGHBOR_OFFSETS) {
            const npx = px + dx;
            const ny = y + dy;
            const npz = pz + dz;
            if (npx < 0 || npx >= GRID_SIZE || ny < 0 || ny >= CHUNK_HEIGHT || npz < 0 || npz >= GRID_SIZE) continue;

            const nBlock = gridGetBlock(grid, npx, ny, npz);
            if (nBlock !== 0 && !transparentIds.has(nBlock)) continue;

            const penalty = nBlock !== 0 ? TRANSPARENT_BLOCK_PENALTY : 1;
            const spread = light - penalty;
            if (spread <= 0) continue;

            const nIdx = ny * GRID_AREA + npz * GRID_SIZE + npx;
            if (sunLight[nIdx] < spread) {
                sunLight[nIdx] = spread;
                queue.push(nIdx);
            }
        }
    }

    const result = new Uint8Array(CHUNK_VOLUME);
    for (let y = 0; y < CHUNK_HEIGHT; y++) {
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                result[y * CHUNK_AREA + lz * CHUNK_SIZE + lx] =
                    sunLight[y * GRID_AREA + (CHUNK_SIZE + lz) * GRID_SIZE + (CHUNK_SIZE + lx)];
            }
        }
    }

    return result;
}

function extractSectionSunlight(sunLight: Uint8Array, sectionIndexes: number[]): Uint8Array {
    const out = new Uint8Array(sectionIndexes.length * SECTION_VOLUME);
    for (let i = 0; i < sectionIndexes.length; i++) {
        const sectionIndex = sectionIndexes[i];
        if (sectionIndex < 0 || sectionIndex >= SECTION_COUNT) {
            continue;
        }
        const srcY0 = sectionIndex * SECTION_HEIGHT;
        const srcOffset = srcY0 * CHUNK_AREA;
        out.set(
            sunLight.subarray(srcOffset, srcOffset + SECTION_VOLUME),
            i * SECTION_VOLUME,
        );
    }
    return out;
}

self.onmessage = (e: MessageEvent<LightingWorkerMessage>) => {
    const msg = e.data;

    switch (msg.type) {
        case "computeLighting": {
            const transparentIds = new Set(msg.transparentBlockIds);
            const sunLight = computeSunLight(
                {
                    blocks: msg.blocks,
                    heightmap: msg.heightmap,
                    highestEverBlockY: msg.highestEverBlockY,
                    lowestEverBlockY: msg.lowestEverBlockY,
                },
                msg.neighbors,
                transparentIds,
            );
            const sectionIndexes = Array.from(new Set(msg.sectionIndexes))
                .filter(sectionIndex => sectionIndex >= 0 && sectionIndex < SECTION_COUNT)
                .sort((a, b) => a - b);
            const sunLightSections = extractSectionSunlight(sunLight, sectionIndexes);

            const response: LightingWorkerResponse = {
                type: "lightingResult",
                requestId: msg.requestId,
                chunkIndex: msg.chunkIndex,
                sectionIndexes,
                sunLightSections,
            };

            (self as unknown as Worker).postMessage(response, [sunLightSections.buffer]);
            break;
        }
    }
};
