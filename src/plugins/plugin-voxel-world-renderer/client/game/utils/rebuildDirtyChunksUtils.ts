import * as THREE from "three";
import type { VoxelWorldClientInterface } from "@plugins/plugin-voxel-world/client";
import type { NeighborChunks } from "../workers/lightingWorkerTypes";
import type { ChunkMeshResultResponse, NeighborChunkBlocks, NeighborChunkSunlight } from "../workers/meshingWorkerTypes";

const CHUNK_MESH_SECTION_SIZE = 1;
export const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 256;
const SECTION_HEIGHT = 16;
const SECTION_COUNT = CHUNK_HEIGHT / SECTION_HEIGHT;
const CHUNK_INDEX_STRIDE = 100_000;
const TRANSPARENT_NAME_PATTERNS = ["leaves", "glass", "ice", "water", "slime"];

export type MeshSectionState = {
    mesh: THREE.Mesh;
};

export type CachedChunkGeometry = {
    chunkX: number;
    chunkZ: number;
    positions: Float32Array;
    uvs: Float32Array;
    uvBoundsMin: Float32Array;
    uvBoundsMax: Float32Array;
    ao: Float32Array;
    shade: Float32Array;
    sunlight: Float32Array;
    indices: Uint32Array;
};

export function getTransparentBlockIds(voxelWorld: VoxelWorldClientInterface): number[] {
    const ids: number[] = [];
    for (const [id, info] of voxelWorld.getBlockTypes()) {
        const lower = info.name.toLowerCase();
        if (TRANSPARENT_NAME_PATTERNS.some(p => lower.includes(p))) {
            ids.push(id);
        }
    }
    return ids;
}

export function gatherNeighborChunks(
    voxelWorld: VoxelWorldClientInterface,
    chunkX: number,
    chunkZ: number,
): NeighborChunks {
    const neighbors: NeighborChunks = {};

    const pick = (dx: number, dz: number) => {
        const c = voxelWorld.getChunkByIndex((chunkX + dx) * CHUNK_INDEX_STRIDE + (chunkZ + dz));
        return c
            ? {
                blocks: c.blocks,
                heightmap: c.heightmap,
                highestEverBlockY: c.highestEverBlockY,
                lowestEverBlockY: c.lowestEverBlockY,
            }
            : undefined;
    };

    neighbors.px = pick(1, 0);
    neighbors.nx = pick(-1, 0);
    neighbors.pz = pick(0, 1);
    neighbors.nz = pick(0, -1);
    neighbors.pxpz = pick(1, 1);
    neighbors.pxnz = pick(1, -1);
    neighbors.nxpz = pick(-1, 1);
    neighbors.nxnz = pick(-1, -1);

    return neighbors;
}

export function sectionOverlapsChunkEverYRange(sectionIndex: number, lowestEverBlockY: number, highestEverBlockY: number) {
    if (highestEverBlockY < 0 || lowestEverBlockY < 0) {
        return false;
    }

    const sectionMinY = sectionIndex * SECTION_HEIGHT;
    const sectionMaxY = sectionMinY + SECTION_HEIGHT - 1;
    return sectionMaxY >= lowestEverBlockY && sectionMinY <= highestEverBlockY;
}

export function getSectionIndexesForChunkEverYRange(
    lowestEverBlockY: number,
    highestEverBlockY: number,
): number[] {
    if (highestEverBlockY < 0 || lowestEverBlockY < 0 || lowestEverBlockY > highestEverBlockY) {
        return [];
    }

    const minSectionIndex = Math.max(0, Math.floor(lowestEverBlockY / SECTION_HEIGHT));
    const maxSectionIndex = Math.min(SECTION_COUNT - 1, Math.floor(highestEverBlockY / SECTION_HEIGHT));
    if (maxSectionIndex < minSectionIndex) {
        return [];
    }

    const sectionIndexes: number[] = [];
    for (let sectionIndex = minSectionIndex; sectionIndex <= maxSectionIndex; sectionIndex++) {
        sectionIndexes.push(sectionIndex);
    }
    return sectionIndexes;
}

export function gatherNeighborBlocks(
    voxelWorld: VoxelWorldClientInterface,
    chunkX: number,
    chunkZ: number,
): NeighborChunkBlocks {
    const pick = (dx: number, dz: number) => {
        const c = voxelWorld.getChunkByIndex((chunkX + dx) * CHUNK_INDEX_STRIDE + (chunkZ + dz));
        return c?.blocks;
    };

    return {
        px: pick(1, 0),
        nx: pick(-1, 0),
        pz: pick(0, 1),
        nz: pick(0, -1),
        pxpz: pick(1, 1),
        pxnz: pick(1, -1),
        nxpz: pick(-1, 1),
        nxnz: pick(-1, -1),
    };
}

export function gatherNeighborSunlight(
    chunkSunlight: Map<number, Uint8Array>,
    chunkX: number,
    chunkZ: number,
): NeighborChunkSunlight {
    const pick = (dx: number, dz: number) => chunkSunlight.get((chunkX + dx) * CHUNK_INDEX_STRIDE + (chunkZ + dz));
    return {
        px: pick(1, 0),
        nx: pick(-1, 0),
        pz: pick(0, 1),
        nz: pick(0, -1),
        pxpz: pick(1, 1),
        pxnz: pick(1, -1),
        nxpz: pick(-1, 1),
        nxnz: pick(-1, -1),
    };
}

export function toCachedChunkGeometry(
    chunkX: number,
    chunkZ: number,
    result: ChunkMeshResultResponse,
): CachedChunkGeometry | null {
    if (
        !result.hasGeometry ||
        !result.positions ||
        !result.uvs ||
        !result.uvBoundsMin ||
        !result.uvBoundsMax ||
        !result.ao ||
        !result.shade ||
        !result.sunlight ||
        !result.indices
    ) {
        return null;
    }
    return {
        chunkX,
        chunkZ,
        positions: result.positions,
        uvs: result.uvs,
        uvBoundsMin: result.uvBoundsMin,
        uvBoundsMax: result.uvBoundsMax,
        ao: result.ao,
        shade: result.shade,
        sunlight: result.sunlight,
        indices: result.indices,
    };
}

function createMeshSectionGeometry(
    chunks: CachedChunkGeometry[],
    sectionChunkX: number,
    sectionChunkZ: number,
): THREE.BufferGeometry | null {
    if (chunks.length === 0) {
        return null;
    }

    let totalPositionCount = 0;
    let totalUvCount = 0;
    let totalUvBoundsMinCount = 0;
    let totalUvBoundsMaxCount = 0;
    let totalAoCount = 0;
    let totalShadeCount = 0;
    let totalSunlightCount = 0;
    let totalIndexCount = 0;
    for (const chunk of chunks) {
        totalPositionCount += chunk.positions.length;
        totalUvCount += chunk.uvs.length;
        totalUvBoundsMinCount += chunk.uvBoundsMin.length;
        totalUvBoundsMaxCount += chunk.uvBoundsMax.length;
        totalAoCount += chunk.ao.length;
        totalShadeCount += chunk.shade.length;
        totalSunlightCount += chunk.sunlight.length;
        totalIndexCount += chunk.indices.length;
    }

    if (totalPositionCount === 0 || totalIndexCount === 0) {
        return null;
    }

    const positions = new Float32Array(totalPositionCount);
    const uvs = new Float32Array(totalUvCount);
    const uvBoundsMin = new Float32Array(totalUvBoundsMinCount);
    const uvBoundsMax = new Float32Array(totalUvBoundsMaxCount);
    const ao = new Float32Array(totalAoCount);
    const shade = new Float32Array(totalShadeCount);
    const sunlight = new Float32Array(totalSunlightCount);
    const indices = new Uint32Array(totalIndexCount);

    let positionOffset = 0;
    let uvOffset = 0;
    let uvBoundsMinOffset = 0;
    let uvBoundsMaxOffset = 0;
    let aoOffset = 0;
    let shadeOffset = 0;
    let sunlightOffset = 0;
    let indexOffset = 0;
    let vertexOffset = 0;

    for (const chunk of chunks) {
        const chunkLocalOffsetX = (chunk.chunkX - sectionChunkX) * CHUNK_SIZE;
        const chunkLocalOffsetZ = (chunk.chunkZ - sectionChunkZ) * CHUNK_SIZE;

        for (let i = 0; i < chunk.positions.length; i += 3) {
            positions[positionOffset + i] = chunk.positions[i] + chunkLocalOffsetX;
            positions[positionOffset + i + 1] = chunk.positions[i + 1];
            positions[positionOffset + i + 2] = chunk.positions[i + 2] + chunkLocalOffsetZ;
        }

        uvs.set(chunk.uvs, uvOffset);
        uvBoundsMin.set(chunk.uvBoundsMin, uvBoundsMinOffset);
        uvBoundsMax.set(chunk.uvBoundsMax, uvBoundsMaxOffset);
        ao.set(chunk.ao, aoOffset);
        shade.set(chunk.shade, shadeOffset);
        sunlight.set(chunk.sunlight, sunlightOffset);

        for (let i = 0; i < chunk.indices.length; i++) {
            indices[indexOffset + i] = chunk.indices[i] + vertexOffset;
        }

        positionOffset += chunk.positions.length;
        uvOffset += chunk.uvs.length;
        uvBoundsMinOffset += chunk.uvBoundsMin.length;
        uvBoundsMaxOffset += chunk.uvBoundsMax.length;
        aoOffset += chunk.ao.length;
        shadeOffset += chunk.shade.length;
        sunlightOffset += chunk.sunlight.length;
        indexOffset += chunk.indices.length;
        vertexOffset += chunk.positions.length / 3;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute("uvBoundsMin", new THREE.BufferAttribute(uvBoundsMin, 2));
    geometry.setAttribute("uvBoundsMax", new THREE.BufferAttribute(uvBoundsMax, 2));
    geometry.setAttribute("ao", new THREE.BufferAttribute(ao, 1));
    geometry.setAttribute("shade", new THREE.BufferAttribute(shade, 1));
    geometry.setAttribute("sunlight", new THREE.BufferAttribute(sunlight, 1));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    return geometry;
}

function getMeshSectionCoordsForChunk(chunkX: number, chunkZ: number) {
    return {
        sectionX: Math.floor(chunkX / CHUNK_MESH_SECTION_SIZE),
        sectionZ: Math.floor(chunkZ / CHUNK_MESH_SECTION_SIZE),
    };
}

export function getMeshSectionKeyForChunk(chunkX: number, chunkZ: number) {
    const { sectionX, sectionZ } = getMeshSectionCoordsForChunk(chunkX, chunkZ);
    return `${sectionX},${sectionZ}`;
}

function parseMeshSectionKey(meshSectionKey: string) {
    const [sectionXRaw, sectionZRaw] = meshSectionKey.split(",");
    return {
        sectionX: Number(sectionXRaw),
        sectionZ: Number(sectionZRaw),
    };
}

export function isChunkWithinRenderDistance(
    chunkX: number,
    chunkZ: number,
    playerChunkX: number,
    playerChunkZ: number,
    renderDistanceChunks: number,
) {
    const dx = chunkX - playerChunkX;
    const dz = chunkZ - playerChunkZ;
    return (dx * dx) + (dz * dz) <= (renderDistanceChunks * renderDistanceChunks);
}

export function updateMeshSectionVisibility(
    meshSections: Map<string, MeshSectionState>,
    playerChunkX: number,
    playerChunkZ: number,
    renderDistanceChunks: number,
) {
    for (const [meshSectionKey, state] of meshSections) {
        const { sectionX, sectionZ } = parseMeshSectionKey(meshSectionKey);
        const minChunkX = sectionX * CHUNK_MESH_SECTION_SIZE;
        const minChunkZ = sectionZ * CHUNK_MESH_SECTION_SIZE;
        const maxChunkX = minChunkX + CHUNK_MESH_SECTION_SIZE - 1;
        const maxChunkZ = minChunkZ + CHUNK_MESH_SECTION_SIZE - 1;

        const closestChunkX = Math.max(minChunkX, Math.min(playerChunkX, maxChunkX));
        const closestChunkZ = Math.max(minChunkZ, Math.min(playerChunkZ, maxChunkZ));
        state.mesh.visible = isChunkWithinRenderDistance(
            closestChunkX,
            closestChunkZ,
            playerChunkX,
            playerChunkZ,
            renderDistanceChunks,
        );
    }
}

function removeMeshSection(
    meshSectionKey: string,
    scene: THREE.Scene,
    meshSections: Map<string, MeshSectionState>,
) {
    const old = meshSections.get(meshSectionKey);
    if (!old) {
        return;
    }

    scene.remove(old.mesh);
    old.mesh.geometry.dispose();
    meshSections.delete(meshSectionKey);
}

function getChunkIndexesInMeshSection(
    voxelWorld: VoxelWorldClientInterface,
    sectionX: number,
    sectionZ: number,
): number[] {
    const baseChunkX = sectionX * CHUNK_MESH_SECTION_SIZE;
    const baseChunkZ = sectionZ * CHUNK_MESH_SECTION_SIZE;
    const out: number[] = [];
    for (let dz = 0; dz < CHUNK_MESH_SECTION_SIZE; dz++) {
        for (let dx = 0; dx < CHUNK_MESH_SECTION_SIZE; dx++) {
            const chunkX = baseChunkX + dx;
            const chunkZ = baseChunkZ + dz;
            const chunk = voxelWorld.getChunkByIndex(chunkX * CHUNK_INDEX_STRIDE + chunkZ);
            if (chunk) {
                out.push(chunkX * CHUNK_INDEX_STRIDE + chunkZ);
            }
        }
    }
    return out;
}

export function rebuildMeshSection(
    meshSectionKey: string,
    voxelWorld: VoxelWorldClientInterface,
    scene: THREE.Scene,
    meshSections: Map<string, MeshSectionState>,
    chunkGeometryCache: Map<number, CachedChunkGeometry>,
    material: THREE.Material,
) {
    const { sectionX, sectionZ } = parseMeshSectionKey(meshSectionKey);
    const sectionChunkX = sectionX * CHUNK_MESH_SECTION_SIZE;
    const sectionChunkZ = sectionZ * CHUNK_MESH_SECTION_SIZE;
    const sectionChunkIndexes = getChunkIndexesInMeshSection(voxelWorld, sectionX, sectionZ);
    const sectionChunks = sectionChunkIndexes
        .map(chunkIndex => chunkGeometryCache.get(chunkIndex))
        .filter((chunk): chunk is CachedChunkGeometry => Boolean(chunk));

    const geometry = createMeshSectionGeometry(sectionChunks, sectionChunkX, sectionChunkZ);
    if (!geometry) {
        removeMeshSection(meshSectionKey, scene, meshSections);
        return;
    }

    let state = meshSections.get(meshSectionKey);
    if (!state) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.frustumCulled = true;
        mesh.position.set(sectionChunkX * CHUNK_SIZE, 0, sectionChunkZ * CHUNK_SIZE);
        scene.add(mesh);
        state = { mesh };
        meshSections.set(meshSectionKey, state);
        return;
    }

    state.mesh.position.set(sectionChunkX * CHUNK_SIZE, 0, sectionChunkZ * CHUNK_SIZE);
    const oldGeometry = state.mesh.geometry;
    state.mesh.geometry = geometry;
    if (oldGeometry) {
        oldGeometry.dispose();
    }
}

export function upsertDirtySections(
    target: Map<number, Set<number>>,
    chunkIndex: number,
    sectionIndexes: readonly number[],
) {
    let sectionSet = target.get(chunkIndex);
    if (!sectionSet) {
        sectionSet = new Set<number>();
        target.set(chunkIndex, sectionSet);
    }

    for (const sectionIndex of sectionIndexes) {
        if (sectionIndex >= 0 && sectionIndex < SECTION_COUNT) {
            sectionSet.add(sectionIndex);
        }
    }
}

export function sortChunkEntriesByDistanceToPlayer<T>(
    entries: Array<[number, T]>,
    voxelWorld: VoxelWorldClientInterface,
    playerChunkX: number,
    playerChunkZ: number,
): Array<[number, T]> {
    return entries.sort(([chunkIndexA], [chunkIndexB]) => {
        const chunkA = voxelWorld.getChunkByIndex(chunkIndexA);
        const chunkB = voxelWorld.getChunkByIndex(chunkIndexB);

        const distanceA = chunkA
            ? ((chunkA.x - playerChunkX) * (chunkA.x - playerChunkX)) + ((chunkA.z - playerChunkZ) * (chunkA.z - playerChunkZ))
            : Number.POSITIVE_INFINITY;
        const distanceB = chunkB
            ? ((chunkB.x - playerChunkX) * (chunkB.x - playerChunkX)) + ((chunkB.z - playerChunkZ) * (chunkB.z - playerChunkZ))
            : Number.POSITIVE_INFINITY;

        return distanceA - distanceB;
    });
}
