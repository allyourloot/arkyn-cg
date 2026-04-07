import { LinearMipmapLinearFilter, NearestFilter, SRGBColorSpace, Texture } from "three";

export type BlockFace = "PX" | "NX" | "PY" | "NY" | "PZ" | "NZ";

export type UvRect = {
    uMin: number;
    vMin: number;
    uMax: number;
    vMax: number;
};

export type BlockFaceUvs = Record<BlockFace, UvRect>;

const FACE_SUFFIX_BY_BLOCK_FACE: Record<BlockFace, string> = {
    PX: "+x",
    NX: "-x",
    PY: "+y",
    NY: "-y",
    PZ: "+z",
    NZ: "-z",
};

const BLOCK_FACES: BlockFace[] = ["PX", "NX", "PY", "NY", "PZ", "NZ"];
const DEFAULT_ERROR_TEXTURE_PATH = "blocks/error.png";
const GENERATED_ATLAS_URL = "/assets/__generated/voxel-world/atlas.png";
const GENERATED_MANIFEST_URL = "/assets/__generated/voxel-world/atlas.json";

type GeneratedAtlasManifest = {
    uvByTexturePath: Record<string, UvRect>;
};

export class TextureAtlas {
    private readonly uvByTexturePath: Map<string, UvRect>;
    private readonly texture: Texture;
    private readonly image: HTMLImageElement;

    private constructor(texture: Texture, image: HTMLImageElement, uvByTexturePath: Map<string, UvRect>) {
        this.texture = texture;
        this.image = image;
        this.uvByTexturePath = uvByTexturePath;
    }

    public static async createFromGenerated() {
        const [atlasImage, manifest] = await Promise.all([
            loadImage(GENERATED_ATLAS_URL),
            loadGeneratedManifest(),
        ]);

        const atlasTexture = new Texture(atlasImage);
        atlasTexture.magFilter = NearestFilter;
        atlasTexture.minFilter = LinearMipmapLinearFilter;
        atlasTexture.generateMipmaps = true;
        atlasTexture.colorSpace = SRGBColorSpace;
        atlasTexture.flipY = false;
        atlasTexture.needsUpdate = true;

        const uvByTexturePath = new Map<string, UvRect>();
        for (const [texturePath, uv] of Object.entries(manifest.uvByTexturePath)) {
            uvByTexturePath.set(normalizeTexturePath(texturePath), uv);
        }

        return new TextureAtlas(atlasTexture, atlasImage, uvByTexturePath);
    }

    public getTexture() {
        return this.texture;
    }

    public getImage() {
        return this.image;
    }

    public getFaceUvs(textureUri: string): BlockFaceUvs {
        const normalizedUri = normalizeTexturePath(textureUri);
        const faceUvs = {} as BlockFaceUvs;
        const singleTextureUv = this.resolveUv(normalizedUri);

        for (const face of BLOCK_FACES) {
            const faceTexturePath = `${normalizedUri}/${FACE_SUFFIX_BY_BLOCK_FACE[face]}.png`;
            faceUvs[face] = this.resolveUv(faceTexturePath) ?? singleTextureUv ?? this.getErrorUv();
        }

        return faceUvs;
    }

    private resolveUv(texturePath: string) {
        const normalized = normalizeTexturePath(texturePath);
        const exact = this.uvByTexturePath.get(normalized);
        if (exact) return exact;

        if (!normalized.endsWith(".png")) {
            return this.uvByTexturePath.get(`${normalized}.png`);
        }

        return undefined;
    }

    private getErrorUv(): UvRect {
        const fallback = this.uvByTexturePath.get(DEFAULT_ERROR_TEXTURE_PATH);
        if (!fallback) {
            const firstUv = this.uvByTexturePath.values().next().value as UvRect | undefined;
            if (firstUv) return firstUv;
            throw new Error("Texture atlas has no UV entries");
        }
        return fallback;
    }
}

function normalizeTexturePath(texturePath: string) {
    const normalized = texturePath.trim().replace(/^\/+/, "");
    if (normalized.startsWith("assets/")) {
        return normalized.slice("assets/".length);
    }
    return normalized;
}

function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load texture '${src}'`));
        image.src = src;
    });
}

async function loadGeneratedManifest() {
    const response = await fetch(GENERATED_MANIFEST_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch voxel atlas manifest (${response.status})`);
    }
    return await response.json() as GeneratedAtlasManifest;
}
