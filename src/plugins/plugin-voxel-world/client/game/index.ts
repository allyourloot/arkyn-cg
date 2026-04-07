import type { ClientRuntime } from "@core/client";
import { Logger } from "@core/shared/utils";
import type { VoxelWorldState } from "../../shared/VoxelWorldState";
import type { BlockTypeInfo, VoxelWorldClientInterface } from "./interfaces/VoxelWorldClientInterface";
import { VoxelWorldClientInterfaceImpl } from "./interfaces/VoxelWorldClientInterfaceImpl";
import { VoxelWorldStore } from "./resources/VoxelWorldStore";

const logger = new Logger("(Plugin) VoxelWorld");
export default function VoxelWorldGame(runtime: ClientRuntime, state: VoxelWorldState) {
    const existing = runtime.getInterface<VoxelWorldClientInterface>("voxel-world");
    if (existing) {
        hydrateBlockTypes(existing, state);
        return;
    }

    const store = new VoxelWorldStore();
    const blockTypes = new Map<number, BlockTypeInfo>();
    const voxelWorld = new VoxelWorldClientInterfaceImpl(store, blockTypes);
    runtime.addInterface("voxel-world", voxelWorld);

    hydrateBlockTypes(voxelWorld, state);
}

function hydrateBlockTypes(voxelWorld: VoxelWorldClientInterface, state: VoxelWorldState) {
    const blockTypes = voxelWorld.getBlockTypes();
    blockTypes.clear();
    for (const [idStr, bt] of state.blockTypes) {
        blockTypes.set(Number(idStr), {
            name: bt.name,
            textureUri: bt.textureUri,
            isMultiTexture: bt.isMultiTexture,
            transparent: bt.transparent,
        });
    }
    logger.info(`Loaded ${blockTypes.size} block types`);
}

export type { VoxelWorldClientInterface };