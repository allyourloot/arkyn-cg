export type BlockTypeInfo = {
    name: string;
    textureUri: string;
    isMultiTexture: boolean;
    transparent: boolean;
};

export type DirtyChunkSections = {
    chunkIndex: number;
    sectionIndexes: number[];
};

export interface VoxelWorldClientInterface {
    getBlock(x: number, y: number, z: number): number;
    setBlock(x: number, y: number, z: number, id: number): void;
    setChunkBlocksFromSparsePairs(
        chunkX: number,
        chunkZ: number,
        sparsePairs: number[],
        highestEverBlockY?: number,
        lowestEverBlockY?: number,
    ): void;
    consumeDirtyChunkIndexes(): number[];
    consumeDirtyChunkSections(): DirtyChunkSections[];
    getChunkByIndex(index: number): {
        x: number;
        z: number;
        blocks: number[];
        heightmap: number[];
        highestEverBlockY: number;
        lowestEverBlockY: number;
    } | undefined;
    getBlockTypes(): Map<number, BlockTypeInfo>;
    /** Returns the highest non-air Y at the given world (x, z), or -1 if empty or missing. */
    getColumnHeight(x: number, z: number): number;
    /** Returns the 16x16 heightmap for a chunk, or undefined if missing. */
    getChunkHeightmap(chunkIndex: number): number[] | undefined;
}
