import type { ClientRuntime } from "@core/client";
import { Logger } from "@core/shared/utils";
import type { ThreeJSRendererInterface } from "@plugins/plugin-threejs-renderer/client";
import type { VoxelWorldClientInterface } from "@plugins/plugin-voxel-world/client";
import { TextureAtlas, type BlockFaceUvs } from "./resources/TextureAtlas";
import type { VoxelWorldRendererClientInterface } from "../interfaces";
import { createAtlasBlockMaterial } from "./utils/atlasBlockMaterial";
import {
    rebuildDirtyChunks,
    type CachedChunkGeometry,
    type MeshSectionState,
} from "./systems/rebuildDirtyChunks";
import { LightingWorkerManager } from "./workers/LightingWorkerManager";
import { MeshingWorkerManager } from "./workers/MeshingWorkerManager";
import { CHUNK_VOLUME, SECTION_COUNT, SECTION_VOLUME } from "./workers/lightingWorkerTypes";

const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 256;
const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
const CHUNK_INDEX_STRIDE = 100_000;
const RENDER_DISTANCE_CHUNKS = 15;

function createLightDebugHud(): HTMLDivElement {
    const el = document.createElement("div");
    el.id = "light-debug-hud";
    Object.assign(el.style, {
        position: "fixed",
        bottom: "12px",
        left: "12px",
        padding: "8px 12px",
        background: "rgba(0,0,0,0.7)",
        color: "#fff",
        fontFamily: "monospace",
        fontSize: "13px",
        lineHeight: "1.5",
        borderRadius: "6px",
        zIndex: "9999",
        pointerEvents: "none",
        whiteSpace: "pre",
    });
    document.body.appendChild(el);
    return el;
}

function getSunlightAt(
    chunkSunlight: Map<number, Uint8Array>,
    wx: number,
    wy: number,
    wz: number,
): number | undefined {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return undefined;
    const cx = Math.floor(wx / CHUNK_SIZE);
    const cz = Math.floor(wz / CHUNK_SIZE);
    const data = chunkSunlight.get(cx * CHUNK_INDEX_STRIDE + cz);
    if (!data) return undefined;
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    return data[wy * CHUNK_AREA + lz * CHUNK_SIZE + lx];
}

function lightBar(level: number): string {
    const filled = Math.round((level / 15) * 10);
    return "\u2588".repeat(filled) + "\u2591".repeat(10 - filled);
}

const logger = new Logger("WorldRenderer");
export default async function WorldRendererGame(runtime: ClientRuntime) {
    const renderDistanceChunks = RENDER_DISTANCE_CHUNKS;
    logger.info(`Client render distance: ${renderDistanceChunks} chunks`);

    const voxelWorld = runtime.getInterface<VoxelWorldClientInterface>("voxel-world");
    if (!voxelWorld) {
        throw new Error("Voxel world interface is required");
    }

    const atlas = await TextureAtlas.createFromGenerated();
    logger.info("Texture atlas loaded");
    const rendererInterface: VoxelWorldRendererClientInterface = {
        getAtlasImage: () => atlas.getImage(),
        getFaceUvs: (textureUri) => atlas.getFaceUvs(textureUri),
    };
    runtime.addInterface("voxel-world-renderer", rendererInterface);

    const blockTypes = voxelWorld.getBlockTypes();
    const blockRenderConfigs = new Map<number, BlockFaceUvs>();

    for (const [id, blockType] of blockTypes) {
        blockRenderConfigs.set(id, atlas.getFaceUvs(blockType.textureUri));
    }
    logger.info(`Built render configs for ${blockRenderConfigs.size} block types`);

    const meshSections = new Map<string, MeshSectionState>();
    const chunkGeometryCache = new Map<number, CachedChunkGeometry>();
    const chunkToMeshSectionKey = new Map<number, string>();
    const material = createAtlasBlockMaterial({ map: atlas.getTexture() });

    const chunkSunlight = new Map<number, Uint8Array>();
    const chunksNeedingLightRebuild = new Map<number, Set<number>>();
    const chunksPendingLightingSubmit = new Map<number, Set<number>>();
    const chunksPendingMeshingSubmit = new Map<number, Set<number>>();
    const queueChunkAndNeighborMeshRebuilds = (chunkIndex: number, sectionIndexes: readonly number[]) => {
        const chunk = voxelWorld.getChunkByIndex(chunkIndex);
        if (!chunk) {
            const existing = chunksNeedingLightRebuild.get(chunkIndex) ?? new Set<number>();
            for (const sectionIndex of sectionIndexes) {
                existing.add(sectionIndex);
            }
            chunksNeedingLightRebuild.set(chunkIndex, existing);
            return;
        }

        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                const neighborIndex = (chunk.x + dx) * CHUNK_INDEX_STRIDE + (chunk.z + dz);
                const existing = chunksNeedingLightRebuild.get(neighborIndex) ?? new Set<number>();
                for (const sectionIndex of sectionIndexes) {
                    existing.add(sectionIndex);
                }
                chunksNeedingLightRebuild.set(neighborIndex, existing);
            }
        }
    };

    const lightingWorker = new LightingWorkerManager();
    const meshingWorker = new MeshingWorkerManager(blockRenderConfigs);
    lightingWorker.setResultCallback((chunkIndex, sectionIndexes, sunLightSections) => {
        let chunkLight = chunkSunlight.get(chunkIndex);
        if (!chunkLight) {
            chunkLight = new Uint8Array(CHUNK_VOLUME);
            chunkLight.fill(15);
            chunkSunlight.set(chunkIndex, chunkLight);
        }

        for (let i = 0; i < sectionIndexes.length; i++) {
            const sectionIndex = sectionIndexes[i];
            if (sectionIndex < 0 || sectionIndex >= SECTION_COUNT) continue;
            const dstOffset = sectionIndex * SECTION_VOLUME;
            const srcOffset = i * SECTION_VOLUME;
            chunkLight.set(
                sunLightSections.subarray(srcOffset, srcOffset + SECTION_VOLUME),
                dstOffset,
            );
        }

        queueChunkAndNeighborMeshRebuilds(chunkIndex, sectionIndexes);
    });

    runtime.addSystem("UPDATE", () =>
        rebuildDirtyChunks(
            runtime,
            meshSections,
            chunkGeometryCache,
            chunkToMeshSectionKey,
            material,
            blockRenderConfigs,
            lightingWorker,
            meshingWorker,
            chunkSunlight,
            chunksNeedingLightRebuild,
            chunksPendingLightingSubmit,
            chunksPendingMeshingSubmit,
            renderDistanceChunks,
        ),
    );

    const debugHud = createLightDebugHud();
    let debugVisible = true;

    window.addEventListener("keydown", (e) => {
        if (e.key === "F3") {
            debugVisible = !debugVisible;
            debugHud.style.display = debugVisible ? "" : "none";
        }
    });

    runtime.addSystem("POST_UPDATE", () => {
        if (!debugVisible) return;

        const threeJS = runtime.getInterface<ThreeJSRendererInterface>("renderer");
        if (!threeJS) return;

        const cam = threeJS.getCamera().position;
        const wx = Math.floor(cam.x);
        const wy = Math.floor(cam.y);
        const wz = Math.floor(cam.z);

        const sunlight = getSunlightAt(chunkSunlight, wx, wy, wz);
        const sunStr = sunlight !== undefined ? `${sunlight}` : "—";
        const barStr = sunlight !== undefined ? lightBar(sunlight) : "";

        debugHud.textContent =
            `pos  ${wx}, ${wy}, ${wz}\n` +
            `sun  ${sunStr.padStart(2)} / 15  ${barStr}`;
    });

    logger.info("World renderer initialized");
}
