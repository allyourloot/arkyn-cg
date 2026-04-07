import type { VoxelWorldStore } from "../resources/VoxelWorldStore";
import type { BlockTypeInfo, DirtyChunkSections, VoxelWorldClientInterface } from "./VoxelWorldClientInterface";

export class VoxelWorldClientInterfaceImpl implements VoxelWorldClientInterface {
    private readonly store: VoxelWorldStore;
    private readonly blockTypes: Map<number, BlockTypeInfo>;

    public constructor(store: VoxelWorldStore, blockTypes: Map<number, BlockTypeInfo>) {
        this.store = store;
        this.blockTypes = blockTypes;
    }

    public getBlock(x: number, y: number, z: number): number {
        return this.store.getBlock(x, y, z);
    }

    public setBlock(x: number, y: number, z: number, id: number): void {
        this.store.setBlock(x, y, z, id);
    }

    public setChunkBlocksFromSparsePairs(
        chunkX: number,
        chunkZ: number,
        sparsePairs: number[],
        highestEverBlockY?: number,
        lowestEverBlockY?: number,
    ): void {
        this.store.setChunkBlocksFromSparsePairs(
            chunkX,
            chunkZ,
            sparsePairs,
            highestEverBlockY,
            lowestEverBlockY,
        );
    }

    public consumeDirtyChunkIndexes(): number[] {
        return this.store.consumeDirtyChunkIndexes();
    }

    public consumeDirtyChunkSections(): DirtyChunkSections[] {
        return this.store.consumeDirtyChunkSections();
    }

    public getChunkByIndex(index: number): {
        x: number;
        z: number;
        blocks: number[];
        heightmap: number[];
        highestEverBlockY: number;
        lowestEverBlockY: number;
    } | undefined {
        return this.store.chunks[index];
    }

    public getBlockTypes(): Map<number, BlockTypeInfo> {
        return this.blockTypes;
    }

    public getColumnHeight(x: number, z: number): number {
        return this.store.getColumnHeight(x, z);
    }

    public getChunkHeightmap(chunkIndex: number): number[] | undefined {
        return this.store.chunks[chunkIndex]?.heightmap;
    }
}
