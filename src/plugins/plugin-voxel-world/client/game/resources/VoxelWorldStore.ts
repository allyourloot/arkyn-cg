const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 256;
const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE;
const SECTION_HEIGHT = 16;
const SECTION_COUNT = CHUNK_HEIGHT / SECTION_HEIGHT;

export type Chunk = {
    x: number;
    z: number;
    blocks: number[];
    heightmap: number[];
    highestEverBlockY: number;
    lowestEverBlockY: number;
};

export class VoxelWorldStore {
    public readonly chunks: Record<number, Chunk> = {};
    private readonly dirtyChunkIndexes = new Set<number>();
    private readonly dirtyChunkSections = new Map<number, Set<number>>();

    public getChunkIndex(x: number, z: number) {
        return x * 100_000 + z;
    }

    public getChunk(x: number, z: number) {
        return this.chunks[this.getChunkIndex(x, z)];
    }

    public deleteChunk(chunkX: number, chunkZ: number) {
        const chunkIndex = this.getChunkIndex(chunkX, chunkZ);
        if (!(chunkIndex in this.chunks)) {
            return;
        }

        delete this.chunks[chunkIndex];
        this.markChunkAndNeighborsDirty(chunkX, chunkZ);
    }

    public setChunkBlocksFromSparsePairs(
        chunkX: number,
        chunkZ: number,
        sparsePairs: number[],
        highestEverBlockY?: number,
        lowestEverBlockY?: number,
    ) {
        const chunk = this.getOrCreateChunk(chunkX, chunkZ);
        chunk.blocks.fill(0);
        for (let i = 0; i < sparsePairs.length; i += 2) {
            const index = sparsePairs[i];
            const id = sparsePairs[i + 1] ?? 0;
            if (!Number.isFinite(index) || !Number.isFinite(id) || id === 0) {
                continue;
            }
            if (index < 0 || index >= CHUNK_VOLUME) {
                continue;
            }

            chunk.blocks[index] = id;
        }

        this.rebuildHeightmap(chunk);
        if (Number.isFinite(highestEverBlockY)) {
            chunk.highestEverBlockY = Math.max(-1, Math.min(CHUNK_HEIGHT - 1, highestEverBlockY as number));
        } else {
            let highest = -1;
            for (const y of chunk.heightmap) {
                if (y > highest) {
                    highest = y;
                }
            }
            chunk.highestEverBlockY = highest;
        }

        if (Number.isFinite(lowestEverBlockY)) {
            chunk.lowestEverBlockY = Math.max(-1, Math.min(CHUNK_HEIGHT - 1, lowestEverBlockY as number));
        } else if (chunk.highestEverBlockY === -1) {
            chunk.lowestEverBlockY = -1;
        } else {
            let lowest = CHUNK_HEIGHT - 1;
            for (const y of chunk.heightmap) {
                if (y >= 0 && y < lowest) {
                    lowest = y;
                }
            }
            chunk.lowestEverBlockY = lowest;
        }

        // Streaming chunk data can arrive in any order; requeue the full 3x3 area
        // so chunks lit against missing/older neighbors get recomputed.
        this.markChunkAndNeighborsDirty(chunkX, chunkZ);
    }

    public getBlock(x: number, y: number, z: number) {
        if (y < 0 || y >= CHUNK_HEIGHT) {
            return 0;
        }

        const { chunkX, chunkZ, localX, localZ } = this.getChunkCoordsAndLocal(x, z);
        const chunk = this.getChunk(chunkX, chunkZ);
        if (!chunk) {
            return 0;
        }

        const blockIndex = y * CHUNK_AREA + localZ * CHUNK_SIZE + localX;
        return chunk.blocks[blockIndex] ?? 0;
    }

    public setBlock(x: number, y: number, z: number, id: number) {
        if (y < 0 || y >= CHUNK_HEIGHT) {
            return;
        }

        const { chunkX, chunkZ, localX, localZ } = this.getChunkCoordsAndLocal(x, z);
        const chunk = this.getOrCreateChunk(chunkX, chunkZ);
        const blockIndex = y * CHUNK_AREA + localZ * CHUNK_SIZE + localX;
        chunk.blocks[blockIndex] = id;

        const colIndex = localZ * CHUNK_SIZE + localX;
        if (id !== 0) {
            if (y > chunk.heightmap[colIndex]) {
                chunk.heightmap[colIndex] = y;
            }
            if (y > chunk.highestEverBlockY) {
                chunk.highestEverBlockY = y;
            }
            if (chunk.lowestEverBlockY === -1 || y < chunk.lowestEverBlockY) {
                chunk.lowestEverBlockY = y;
            }
        } else if (y === chunk.heightmap[colIndex]) {
            chunk.heightmap[colIndex] = this.scanColumnTop(chunk, localX, localZ);
        }

        const sectionIndex = this.getSectionIndexFromY(y);
        this.markChunkSectionsDirtyThroughY(chunkX, chunkZ, sectionIndex);
        if (localX === 0) {
            this.markChunkSectionsDirtyThroughY(chunkX - 1, chunkZ, sectionIndex);
        }
        if (localX === CHUNK_SIZE - 1) {
            this.markChunkSectionsDirtyThroughY(chunkX + 1, chunkZ, sectionIndex);
        }
        if (localZ === 0) {
            this.markChunkSectionsDirtyThroughY(chunkX, chunkZ - 1, sectionIndex);
        }
        if (localZ === CHUNK_SIZE - 1) {
            this.markChunkSectionsDirtyThroughY(chunkX, chunkZ + 1, sectionIndex);
        }
    }

    public consumeDirtyChunkIndexes() {
        const dirty = Array.from(this.dirtyChunkIndexes.values());
        this.dirtyChunkIndexes.clear();
        this.dirtyChunkSections.clear();
        return dirty;
    }

    public consumeDirtyChunkSections() {
        const dirty = Array.from(this.dirtyChunkSections.entries())
            .map(([chunkIndex, sectionSet]) => ({
                chunkIndex,
                sectionIndexes: Array.from(sectionSet.values()).sort((a, b) => a - b),
            }));
        this.dirtyChunkSections.clear();
        this.dirtyChunkIndexes.clear();
        return dirty;
    }

    public getColumnHeight(x: number, z: number): number {
        const { chunkX, chunkZ, localX, localZ } = this.getChunkCoordsAndLocal(x, z);
        const chunk = this.getChunk(chunkX, chunkZ);
        if (!chunk) {
            return -1;
        }
        return chunk.heightmap[localZ * CHUNK_SIZE + localX];
    }

    private getOrCreateChunk(chunkX: number, chunkZ: number) {
        const existing = this.getChunk(chunkX, chunkZ);
        if (existing) {
            return existing;
        }

        const newChunk: Chunk = {
            x: chunkX,
            z: chunkZ,
            blocks: Array(CHUNK_VOLUME).fill(0),
            heightmap: Array(CHUNK_AREA).fill(-1),
            highestEverBlockY: -1,
            lowestEverBlockY: -1,
        };
        const chunkIndex = this.getChunkIndex(chunkX, chunkZ);
        this.chunks[chunkIndex] = newChunk;
        this.markChunkAllSectionsDirty(chunkX, chunkZ);
        return newChunk;
    }

    private rebuildHeightmap(chunk: Chunk) {
        chunk.heightmap.fill(-1);
        for (let lz = 0; lz < CHUNK_SIZE; lz++) {
            for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                chunk.heightmap[lz * CHUNK_SIZE + lx] = this.scanColumnTop(chunk, lx, lz);
            }
        }
    }

    private scanColumnTop(chunk: Chunk, localX: number, localZ: number): number {
        for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
            if (chunk.blocks[y * CHUNK_AREA + localZ * CHUNK_SIZE + localX] !== 0) {
                return y;
            }
        }
        return -1;
    }

    private getChunkCoordsAndLocal(x: number, z: number) {
        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        const localX = x - chunkX * CHUNK_SIZE;
        const localZ = z - chunkZ * CHUNK_SIZE;
        return { chunkX, chunkZ, localX, localZ };
    }

    private markChunkDirty(chunkX: number, chunkZ: number) {
        this.markChunkAllSectionsDirty(chunkX, chunkZ);
    }

    private markChunkSectionDirty(chunkX: number, chunkZ: number, sectionIndex: number) {
        if (sectionIndex < 0 || sectionIndex >= SECTION_COUNT) {
            return;
        }

        const chunkIndex = this.getChunkIndex(chunkX, chunkZ);
        this.dirtyChunkIndexes.add(chunkIndex);

        const sectionSet = this.dirtyChunkSections.get(chunkIndex);
        if (sectionSet) {
            sectionSet.add(sectionIndex);
            return;
        }

        this.dirtyChunkSections.set(chunkIndex, new Set([sectionIndex]));
    }

    private markChunkSectionsDirtyThroughY(chunkX: number, chunkZ: number, maxSectionIndex: number) {
        const clampedMaxSection = Math.max(0, Math.min(SECTION_COUNT - 1, maxSectionIndex));
        for (let sectionIndex = 0; sectionIndex <= clampedMaxSection; sectionIndex++) {
            this.markChunkSectionDirty(chunkX, chunkZ, sectionIndex);
        }
    }

    private markChunkAllSectionsDirty(chunkX: number, chunkZ: number) {
        for (let sectionIndex = 0; sectionIndex < SECTION_COUNT; sectionIndex++) {
            this.markChunkSectionDirty(chunkX, chunkZ, sectionIndex);
        }
    }

    private getSectionIndexFromY(y: number) {
        return (y / SECTION_HEIGHT) | 0;
    }

    private markChunkAndNeighborsDirty(chunkX: number, chunkZ: number) {
        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                this.markChunkDirty(chunkX + dx, chunkZ + dz);
            }
        }
    }
}

export { CHUNK_SIZE, CHUNK_HEIGHT, CHUNK_AREA, CHUNK_VOLUME };
