import type { BlockFace, UvRect } from "./game/resources/TextureAtlas";

export type VoxelWorldRendererClientInterface = {
    getAtlasImage(): HTMLImageElement;
    getFaceUvs(textureUri: string): Record<BlockFace, UvRect>;
};

export type { BlockFace, UvRect };
