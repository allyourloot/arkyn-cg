import * as THREE from "three";
import type { ClientRuntime } from "@core/client";
import type { ThreeJSRendererInterface } from "@plugins/plugin-threejs-renderer/client";
import type { VoxelWorldClientInterface } from "@plugins/plugin-voxel-world/client";
import type { BlockFaceUvs } from "../resources/TextureAtlas";
import {
    CHUNK_SIZE,
    gatherNeighborBlocks,
    gatherNeighborChunks,
    gatherNeighborSunlight,
    getMeshSectionKeyForChunk,
    getSectionIndexesForChunkEverYRange,
    getTransparentBlockIds,
    isChunkWithinRenderDistance,
    rebuildMeshSection,
    sectionOverlapsChunkEverYRange,
    sortChunkEntriesByDistanceToPlayer,
    toCachedChunkGeometry,
    updateMeshSectionVisibility,
    upsertDirtySections,
    type CachedChunkGeometry,
    type MeshSectionState,
} from "../utils/rebuildDirtyChunksUtils";
import { MeshingWorkerManager } from "../workers/MeshingWorkerManager";
import type { LightingWorkerManager } from "../workers/LightingWorkerManager";

const MAX_MESH_COMMITS_PER_FRAME = 2;
const MAX_CHUNK_REBUILDS_PER_CALL = 5;
const MAX_LIGHTING_SUBMITS_PER_CALL = 2;
const MAX_LIGHT_REBUILD_UPSERTS_PER_CALL = 1;
const MAX_MESHING_SUBMITS_PER_CALL = MAX_CHUNK_REBUILDS_PER_CALL - MAX_LIGHTING_SUBMITS_PER_CALL - MAX_LIGHT_REBUILD_UPSERTS_PER_CALL;

export type { CachedChunkGeometry, MeshSectionState };

export function rebuildDirtyChunks(
    runtime: ClientRuntime,
    meshSections: Map<string, MeshSectionState>,
    chunkGeometryCache: Map<number, CachedChunkGeometry>,
    chunkToMeshSectionKey: Map<number, string>,
    material: THREE.Material,
    _blockRenderConfigs: Map<number, BlockFaceUvs>,
    lightingWorker: LightingWorkerManager,
    meshingWorker: MeshingWorkerManager,
    chunkSunlight: Map<number, Uint8Array>,
    chunksNeedingLightRebuild: Map<number, Set<number>>,
    chunksPendingLightingSubmit: Map<number, Set<number>>,
    chunksPendingMeshingSubmit: Map<number, Set<number>>,
    renderDistanceChunks: number,
) {
    const voxelWorld = runtime.getInterface<VoxelWorldClientInterface>("voxel-world");
    const threeJSRenderer = runtime.getInterface<ThreeJSRendererInterface>("renderer");
    if (!voxelWorld || !threeJSRenderer) return;

    const scene = threeJSRenderer.getScene();

    const dirtyChunks = voxelWorld.consumeDirtyChunkSections();

    const dirtyMeshSectionKeys = new Set<string>();
    for (const { chunkIndex, sectionIndexes } of dirtyChunks) {
        const chunk = voxelWorld.getChunkByIndex(chunkIndex);
        if (!chunk) {
            chunkSunlight.delete(chunkIndex);
            chunkGeometryCache.delete(chunkIndex);
            const oldMeshSectionKey = chunkToMeshSectionKey.get(chunkIndex);
            if (oldMeshSectionKey !== undefined) {
                dirtyMeshSectionKeys.add(oldMeshSectionKey);
            }
            chunkToMeshSectionKey.delete(chunkIndex);
            chunksNeedingLightRebuild.delete(chunkIndex);
            chunksPendingLightingSubmit.delete(chunkIndex);
            chunksPendingMeshingSubmit.delete(chunkIndex);
            meshingWorker.clearChunk(chunkIndex);
            continue;
        }

        const meshSectionKey = getMeshSectionKeyForChunk(chunk.x, chunk.z);
        chunkToMeshSectionKey.set(chunkIndex, meshSectionKey);
        dirtyMeshSectionKeys.add(meshSectionKey);

        chunksNeedingLightRebuild.delete(chunkIndex);
        upsertDirtySections(chunksPendingLightingSubmit, chunkIndex, sectionIndexes);
        upsertDirtySections(chunksPendingMeshingSubmit, chunkIndex, sectionIndexes);
    }

    const camera = threeJSRenderer.getCamera();
    const playerChunkX = Math.floor(camera.position.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(camera.position.z / CHUNK_SIZE);
    const transparentBlockIds = getTransparentBlockIds(voxelWorld);
    updateMeshSectionVisibility(
        meshSections,
        playerChunkX,
        playerChunkZ,
        renderDistanceChunks,
    );

    if (chunksPendingLightingSubmit.size > 0 && MAX_LIGHTING_SUBMITS_PER_CALL > 0) {
        let lightingSubmits = 0;
        const pendingEntries = sortChunkEntriesByDistanceToPlayer(
            Array.from(chunksPendingLightingSubmit.entries()),
            voxelWorld,
            playerChunkX,
            playerChunkZ,
        );
        for (const [chunkIndex, sectionSet] of pendingEntries) {
            if (lightingSubmits >= MAX_LIGHTING_SUBMITS_PER_CALL) {
                break;
            }

            const chunk = voxelWorld.getChunkByIndex(chunkIndex);
            if (!chunk) {
                chunksPendingLightingSubmit.delete(chunkIndex);
                lightingSubmits += 1;
                continue;
            }
            if (!isChunkWithinRenderDistance(
                chunk.x,
                chunk.z,
                playerChunkX,
                playerChunkZ,
                renderDistanceChunks,
            )) {
                continue;
            }

            const neighbors = gatherNeighborChunks(voxelWorld, chunk.x, chunk.z);
            const sectionIndexes = Array.from(sectionSet.values())
                .filter(sectionIndex =>
                    sectionOverlapsChunkEverYRange(
                        sectionIndex,
                        chunk.lowestEverBlockY,
                        chunk.highestEverBlockY,
                    ),
                )
                .sort((a, b) => a - b);
            if (sectionIndexes.length === 0) {
                chunksPendingLightingSubmit.delete(chunkIndex);
                lightingSubmits += 1;
                continue;
            }

            lightingWorker.submitChunk(
                chunkIndex,
                chunk.x,
                chunk.z,
                sectionIndexes,
                chunk.blocks,
                chunk.heightmap,
                chunk.highestEverBlockY,
                chunk.lowestEverBlockY,
                neighbors,
                transparentBlockIds,
            );
            chunksPendingLightingSubmit.delete(chunkIndex);
            lightingSubmits += 1;
        }
    }

    if (chunksNeedingLightRebuild.size > 0 && MAX_LIGHT_REBUILD_UPSERTS_PER_CALL > 0) {
        let lightRebuildUpserts = 0;
        const pendingMeshUpdates = sortChunkEntriesByDistanceToPlayer(
            Array.from(chunksNeedingLightRebuild.entries()),
            voxelWorld,
            playerChunkX,
            playerChunkZ,
        );
        for (const [chunkIndex, sectionSet] of pendingMeshUpdates) {
            if (lightRebuildUpserts >= MAX_LIGHT_REBUILD_UPSERTS_PER_CALL) {
                break;
            }

            const chunk = voxelWorld.getChunkByIndex(chunkIndex);
            if (!chunk) {
                chunksNeedingLightRebuild.delete(chunkIndex);
                chunkGeometryCache.delete(chunkIndex);
                const meshSectionKey = chunkToMeshSectionKey.get(chunkIndex);
                if (meshSectionKey !== undefined) {
                    dirtyMeshSectionKeys.add(meshSectionKey);
                }
                chunkToMeshSectionKey.delete(chunkIndex);
                lightRebuildUpserts += 1;
                continue;
            }
            if (!isChunkWithinRenderDistance(
                chunk.x,
                chunk.z,
                playerChunkX,
                playerChunkZ,
                renderDistanceChunks,
            )) {
                continue;
            }

            const sectionIndexes = Array.from(sectionSet.values()).sort((a, b) => a - b);
            upsertDirtySections(
                chunksPendingMeshingSubmit,
                chunkIndex,
                sectionIndexes,
            );
            chunksNeedingLightRebuild.delete(chunkIndex);
            lightRebuildUpserts += 1;
        }
    }

    if (chunksPendingMeshingSubmit.size > 0 && MAX_MESHING_SUBMITS_PER_CALL > 0) {
        let meshingSubmits = 0;
        const pendingMeshingEntries = sortChunkEntriesByDistanceToPlayer(
            Array.from(chunksPendingMeshingSubmit.entries()),
            voxelWorld,
            playerChunkX,
            playerChunkZ,
        );
        for (const [chunkIndex] of pendingMeshingEntries) {
            if (meshingSubmits >= MAX_MESHING_SUBMITS_PER_CALL) {
                break;
            }

            const chunk = voxelWorld.getChunkByIndex(chunkIndex);
            if (!chunk) {
                chunksPendingMeshingSubmit.delete(chunkIndex);
                chunkGeometryCache.delete(chunkIndex);
                const meshSectionKey = chunkToMeshSectionKey.get(chunkIndex);
                if (meshSectionKey !== undefined) {
                    dirtyMeshSectionKeys.add(meshSectionKey);
                }
                chunkToMeshSectionKey.delete(chunkIndex);
                meshingWorker.clearChunk(chunkIndex);
                meshingSubmits += 1;
                continue;
            }
            if (!isChunkWithinRenderDistance(
                chunk.x,
                chunk.z,
                playerChunkX,
                playerChunkZ,
                renderDistanceChunks,
            )) {
                continue;
            }

            const sectionIndexes = getSectionIndexesForChunkEverYRange(
                chunk.lowestEverBlockY,
                chunk.highestEverBlockY,
            );
            if (sectionIndexes.length === 0) {
                chunksPendingMeshingSubmit.delete(chunkIndex);
                chunkGeometryCache.delete(chunkIndex);
                const meshSectionKey = chunkToMeshSectionKey.get(chunkIndex);
                if (meshSectionKey !== undefined) {
                    dirtyMeshSectionKeys.add(meshSectionKey);
                }
                chunkToMeshSectionKey.delete(chunkIndex);
                meshingWorker.clearChunk(chunkIndex);
                meshingSubmits += 1;
                continue;
            }
            const neighborBlocks = gatherNeighborBlocks(voxelWorld, chunk.x, chunk.z);
            const neighborSunlight = gatherNeighborSunlight(chunkSunlight, chunk.x, chunk.z);

            meshingWorker.submitChunk(
                chunkIndex,
                sectionIndexes,
                chunk.blocks,
                chunk.highestEverBlockY,
                chunk.lowestEverBlockY,
                transparentBlockIds,
                neighborBlocks,
                chunkSunlight.get(chunkIndex),
                neighborSunlight,
            );
            chunksPendingMeshingSubmit.delete(chunkIndex);
            meshingSubmits += 1;
        }
    }

    const results = meshingWorker.takePendingResults(MAX_MESH_COMMITS_PER_FRAME);
    for (const result of results) {
        const chunk = voxelWorld.getChunkByIndex(result.chunkIndex);
        if (!chunk) {
            chunkGeometryCache.delete(result.chunkIndex);
            const oldMeshSectionKey = chunkToMeshSectionKey.get(result.chunkIndex);
            if (oldMeshSectionKey !== undefined) {
                dirtyMeshSectionKeys.add(oldMeshSectionKey);
            }
            chunkToMeshSectionKey.delete(result.chunkIndex);
            continue;
        }

        const meshSectionKey = getMeshSectionKeyForChunk(chunk.x, chunk.z);
        chunkToMeshSectionKey.set(result.chunkIndex, meshSectionKey);

        const cachedGeometry = toCachedChunkGeometry(chunk.x, chunk.z, result);
        if (cachedGeometry) {
            chunkGeometryCache.set(result.chunkIndex, cachedGeometry);
        } else {
            chunkGeometryCache.delete(result.chunkIndex);
        }
        dirtyMeshSectionKeys.add(meshSectionKey);
    }

    for (const meshSectionKey of dirtyMeshSectionKeys) {
        rebuildMeshSection(
            meshSectionKey,
            voxelWorld,
            scene,
            meshSections,
            chunkGeometryCache,
            material,
        );
    }
}
