import { MapSchema, Schema, type } from "@colyseus/schema";
import { PluginState } from "@core/shared";

export class BlockType extends Schema {
    @type("string") name: string = "";
    @type("string") textureUri: string = "";
    @type("boolean") isMultiTexture: boolean = false;
    @type("boolean") transparent: boolean = false;
}

export class VoxelWorldState extends PluginState {
    @type({ map: BlockType }) blockTypes = new MapSchema<BlockType>();
}

export const VOXEL_WORLD_CHUNK_MESSAGE = "voxel-world:chunk";
export const VOXEL_WORLD_CHUNKS_DONE_MESSAGE = "voxel-world:chunks-done";
export const VOXEL_WORLD_BLOCK_UPDATES_MESSAGE = "voxel-world:block-updates";
