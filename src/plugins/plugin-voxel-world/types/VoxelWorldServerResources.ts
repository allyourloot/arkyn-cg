type Chunk = {
    x: number;
    z: number;
    blocks: number[];
    highestEverBlockY: number;
    lowestEverBlockY: number;
};

export type BlockChange = { x: number; y: number; z: number; blockId: number };

export class VoxelWorld {
    public chunks: Record<number, Chunk> = {};
    public loaded: boolean = false;
    private readonly _pendingChanges: BlockChange[] = [];

    public getChunk(x: number, z: number) {
        return this.chunks[this.getChunkIndex(x, z)];
    }

    public getChunkIndex(x: number, z: number) {
        return x * 100_000 + z;
    }

    public getOrCreateChunk(x: number, z: number) {
        const chunk = this.getChunk(x, z);
        if (chunk) {
            return chunk;
        }

        const newChunk = {
            x,
            z,
            blocks: Array(CHUNK_VOLUME).fill(0),
            highestEverBlockY: -1,
            lowestEverBlockY: -1,
        };
        this.chunks[this.getChunkIndex(x, z)] = newChunk;
        return newChunk;
    }

    public getBlockIndex(x: number, y: number, z: number) {
        return y * CHUNK_SIZE * CHUNK_SIZE + z * CHUNK_SIZE + x;
    }

    private getChunkCoordsAndLocal(x: number, z: number) {
        const chunkX = Math.floor(x / CHUNK_SIZE);
        const chunkZ = Math.floor(z / CHUNK_SIZE);
        const localX = x - chunkX * CHUNK_SIZE;
        const localZ = z - chunkZ * CHUNK_SIZE;
        return { chunkX, chunkZ, localX, localZ };
    }

    public setBlock(x: number, y: number, z: number, id: number) {
        if (y < 0 || y >= CHUNK_HEIGHT) {
            return;
        }

        const { chunkX, chunkZ, localX, localZ } = this.getChunkCoordsAndLocal(x, z);
        const chunk = this.getOrCreateChunk(chunkX, chunkZ);
        chunk.blocks[this.getBlockIndex(localX, y, localZ)] = id;
        if (id !== 0) {
            if (y > chunk.highestEverBlockY) {
                chunk.highestEverBlockY = y;
            }
            if (chunk.lowestEverBlockY === -1 || y < chunk.lowestEverBlockY) {
                chunk.lowestEverBlockY = y;
            }
        }

        this._pendingChanges.push({ x, y, z, blockId: id });
    }

    public drainPendingChanges(): BlockChange[] {
        if (this._pendingChanges.length === 0) return [];
        return this._pendingChanges.splice(0);
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

        return chunk.blocks[this.getBlockIndex(localX, y, localZ)];
    }

    public isSolidAt(x: number, y: number, z: number) {
        const blockX = Math.floor(x);
        const blockY = Math.floor(y);
        const blockZ = Math.floor(z);
        return this.getBlock(blockX, blockY, blockZ) !== 0;
    }
}

export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 256;
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
export const CHUNK_VOLUME = CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE;

export interface VoxelWorldServerResources {
    world: VoxelWorld;
}
