import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { Logger } from "@core/shared/utils";

type UvRect = {
    uMin: number;
    vMin: number;
    uMax: number;
    vMax: number;
};

type AtlasManifest = {
    tilePaddingPx: number;
    uvInsetPx: number;
    atlasWidth: number;
    atlasHeight: number;
    tileSizePx: number;
    uvByTexturePath: Record<string, UvRect>;
};

type TextureEntry = {
    texturePath: string;
    image: PngImage;
};

type PngImage = {
    width: number;
    height: number;
    data: Buffer;
};

const TILE_PADDING_PX = 2;
const UV_INSET_PX = 0.5;
const DEFAULT_ERROR_TEXTURE_PATH = "blocks/error.png";

const ASSETS_DIR = path.join(process.cwd(), "assets");
const BLOCKS_DIR = path.join(ASSETS_DIR, "blocks");
const GENERATED_DIR = path.join(ASSETS_DIR, "__generated", "voxel-world");
const GENERATED_ATLAS_PATH = path.join(GENERATED_DIR, "atlas.png");
const GENERATED_MANIFEST_PATH = path.join(GENERATED_DIR, "atlas.json");

export function generateTextureAtlas(logger: Logger) {
    if (existsSync(GENERATED_ATLAS_PATH) && existsSync(GENERATED_MANIFEST_PATH)) {
        logger.info(`Using existing voxel atlas at '${GENERATED_ATLAS_PATH}'`);
        return;
    }

    const discoveredPaths = collectTexturePaths();
    const texturePaths = dedupePreserveOrder([DEFAULT_ERROR_TEXTURE_PATH, ...discoveredPaths]);
    const textures = loadTextureEntries(texturePaths);

    if (textures.length === 0) {
        throw new Error("Failed to load any block textures for atlas generation");
    }

    const tileSizePx = textures.reduce((max, entry) => Math.max(max, entry.image.width, entry.image.height), 1);
    const atlasColumns = Math.ceil(Math.sqrt(textures.length));
    const atlasRows = Math.ceil(textures.length / atlasColumns);
    const atlasCellSizePx = tileSizePx + (TILE_PADDING_PX * 2);
    const atlasWidth = atlasColumns * atlasCellSizePx;
    const atlasHeight = atlasRows * atlasCellSizePx;
    const atlas = new PNG({ width: atlasWidth, height: atlasHeight });
    const uvByTexturePath: Record<string, UvRect> = {};

    for (let i = 0; i < textures.length; i += 1) {
        const { texturePath, image } = textures[i];
        const col = i % atlasColumns;
        const row = Math.floor(i / atlasColumns);
        const x = col * atlasCellSizePx;
        const y = row * atlasCellSizePx;
        const contentX = x + TILE_PADDING_PX;
        const contentY = y + TILE_PADDING_PX;

        drawScaledNearest(image, atlas, contentX, contentY, tileSizePx);
        extrudeTilePadding(atlas, contentX, contentY, tileSizePx, TILE_PADDING_PX);

        const uvInsetU = UV_INSET_PX / atlasWidth;
        const uvInsetV = UV_INSET_PX / atlasHeight;
        uvByTexturePath[texturePath] = {
            uMin: contentX / atlasWidth + uvInsetU,
            vMin: contentY / atlasHeight + uvInsetV,
            uMax: (contentX + tileSizePx) / atlasWidth - uvInsetU,
            vMax: (contentY + tileSizePx) / atlasHeight - uvInsetV,
        };
    }

    const manifest: AtlasManifest = {
        tilePaddingPx: TILE_PADDING_PX,
        uvInsetPx: UV_INSET_PX,
        atlasWidth,
        atlasHeight,
        tileSizePx,
        uvByTexturePath,
    };

    mkdirSync(GENERATED_DIR, { recursive: true });
    writeFileSync(GENERATED_ATLAS_PATH, PNG.sync.write(atlas));
    writeFileSync(GENERATED_MANIFEST_PATH, JSON.stringify(manifest));

    logger.info(`Generated voxel atlas with ${textures.length} textures at '${GENERATED_ATLAS_PATH}'`);
}

function collectTexturePaths() {
    if (!existsSync(BLOCKS_DIR)) {
        return [];
    }

    const discovered: string[] = [];
    collectTexturePathsRecursive(BLOCKS_DIR, "blocks", discovered);
    return dedupePreserveOrder(discovered);
}

function collectTexturePathsRecursive(currentDir: string, relativePrefix: string, discovered: string[]) {
    const entries = readdirSync(currentDir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
        if (entry.isDirectory()) {
            const nextDir = path.join(currentDir, entry.name);
            const nextPrefix = path.posix.join(relativePrefix, entry.name);
            collectTexturePathsRecursive(nextDir, nextPrefix, discovered);
            continue;
        }

        if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".png")) {
            continue;
        }

        discovered.push(path.posix.join(relativePrefix, entry.name));
    }
}

function loadTextureEntries(texturePaths: string[]) {
    const loaded: TextureEntry[] = [];

    for (const texturePath of texturePaths) {
        const filePath = path.join(ASSETS_DIR, ...texturePath.split("/"));
        if (!existsSync(filePath)) {
            continue;
        }

        try {
            const image = PNG.sync.read(readFileSync(filePath)) as PngImage;
            if (image.width <= 0 || image.height <= 0) {
                continue;
            }
            loaded.push({ texturePath, image });
        } catch {
            continue;
        }
    }

    return loaded;
}

function drawScaledNearest(source: PngImage, target: PngImage, targetX: number, targetY: number, size: number) {
    for (let y = 0; y < size; y += 1) {
        const srcY = Math.min(source.height - 1, Math.floor((y / size) * source.height));
        for (let x = 0; x < size; x += 1) {
            const srcX = Math.min(source.width - 1, Math.floor((x / size) * source.width));
            copyPixel(source, srcX, srcY, target, targetX + x, targetY + y);
        }
    }
}

function extrudeTilePadding(image: PngImage, x: number, y: number, size: number, padding: number) {
    if (padding <= 0) return;

    for (let py = 0; py < size; py += 1) {
        for (let p = 1; p <= padding; p += 1) {
            copyPixel(image, x, y + py, image, x - p, y + py);
            copyPixel(image, x + size - 1, y + py, image, x + size - 1 + p, y + py);
        }
    }

    for (let px = 0; px < size; px += 1) {
        for (let p = 1; p <= padding; p += 1) {
            copyPixel(image, x + px, y, image, x + px, y - p);
            copyPixel(image, x + px, y + size - 1, image, x + px, y + size - 1 + p);
        }
    }

    for (let py = 1; py <= padding; py += 1) {
        for (let px = 1; px <= padding; px += 1) {
            copyPixel(image, x, y, image, x - px, y - py);
            copyPixel(image, x + size - 1, y, image, x + size - 1 + px, y - py);
            copyPixel(image, x, y + size - 1, image, x - px, y + size - 1 + py);
            copyPixel(image, x + size - 1, y + size - 1, image, x + size - 1 + px, y + size - 1 + py);
        }
    }
}

function copyPixel(source: PngImage, sourceX: number, sourceY: number, target: PngImage, targetX: number, targetY: number) {
    if (
        sourceX < 0 || sourceY < 0 || sourceX >= source.width || sourceY >= source.height ||
        targetX < 0 || targetY < 0 || targetX >= target.width || targetY >= target.height
    ) {
        return;
    }

    const sourceIndex = (sourceY * source.width + sourceX) * 4;
    const targetIndex = (targetY * target.width + targetX) * 4;
    target.data[targetIndex] = source.data[sourceIndex];
    target.data[targetIndex + 1] = source.data[sourceIndex + 1];
    target.data[targetIndex + 2] = source.data[sourceIndex + 2];
    target.data[targetIndex + 3] = source.data[sourceIndex + 3];
}

function dedupePreserveOrder(values: string[]) {
    return Array.from(new Set(values));
}
