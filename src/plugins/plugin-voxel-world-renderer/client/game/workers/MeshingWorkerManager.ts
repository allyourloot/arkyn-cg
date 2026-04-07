import type { BlockFaceUvs } from "../resources/TextureAtlas";
import type {
    ChunkMeshResultResponse,
    ComputeChunkMeshRequest,
    MeshingWorkerResponse,
    NeighborChunkBlocks,
    NeighborChunkSunlight,
} from "./meshingWorkerTypes";

const LOG_MESH_TASK_TIMINGS = true;

export class MeshingWorkerManager {
    private readonly worker: Worker;
    private readonly latestRequestIdByChunk = new Map<number, number>();
    private readonly pendingResultsByChunk = new Map<number, ChunkMeshResultResponse>();
    private readonly startedAtByRequestId = new Map<number, number>();
    private nextRequestId = 1;

    constructor(blockRenderConfigs: Map<number, BlockFaceUvs>) {
        this.worker = new Worker(
            new URL("./meshingWorker.js", import.meta.url),
            { type: "module" },
        );

        this.worker.onmessage = (e: MessageEvent<MeshingWorkerResponse>) => {
            const msg = e.data;
            if (msg.type !== "chunkMeshResult") return;

            const startedAt = this.startedAtByRequestId.get(msg.requestId);
            this.startedAtByRequestId.delete(msg.requestId);
            if (this.latestRequestIdByChunk.get(msg.chunkIndex) !== msg.requestId) {
                return;
            }

            if (LOG_MESH_TASK_TIMINGS && startedAt !== undefined) {
                const elapsedMs = performance.now() - startedAt;
                const geometryState = msg.hasGeometry ? "geometry" : "empty";
                console.log(
                    `[Meshing] chunk=${msg.chunkIndex} request=${msg.requestId} finished in ${elapsedMs.toFixed(2)}ms (${geometryState})`,
                );
            }

            this.pendingResultsByChunk.set(msg.chunkIndex, msg);
        };

        this.worker.postMessage({
            type: "initBlockRenderConfigs",
            entries: Array.from(blockRenderConfigs.entries()),
        });
    }

    public submitChunk(
        chunkIndex: number,
        sectionIndexes: number[],
        chunkBlocks: number[],
        highestEverBlockY: number,
        lowestEverBlockY: number,
        transparentBlockIds: number[],
        neighborBlocks: NeighborChunkBlocks,
        chunkSunlight: Uint8Array | undefined,
        neighborSunlight: NeighborChunkSunlight,
    ) {
        const requestId = this.nextRequestId++;
        this.latestRequestIdByChunk.set(chunkIndex, requestId);
        this.startedAtByRequestId.set(requestId, performance.now());

        const msg: ComputeChunkMeshRequest = {
            type: "computeChunkMesh",
            requestId,
            chunkIndex,
            sectionIndexes,
            chunkBlocks,
            highestEverBlockY,
            lowestEverBlockY,
            transparentBlockIds,
            neighborBlocks,
            chunkSunlight,
            neighborSunlight,
        };

        this.worker.postMessage(msg);
    }

    public takePendingResults(limit: number): ChunkMeshResultResponse[] {
        if (limit <= 0 || this.pendingResultsByChunk.size === 0) {
            return [];
        }

        const out: ChunkMeshResultResponse[] = [];
        for (const [chunkIndex, result] of this.pendingResultsByChunk) {
            out.push(result);
            this.pendingResultsByChunk.delete(chunkIndex);
            if (out.length >= limit) {
                break;
            }
        }
        return out;
    }

    public clearChunk(chunkIndex: number) {
        const requestId = this.latestRequestIdByChunk.get(chunkIndex);
        if (requestId !== undefined) {
            this.startedAtByRequestId.delete(requestId);
        }
        this.latestRequestIdByChunk.delete(chunkIndex);
        this.pendingResultsByChunk.delete(chunkIndex);
    }

    public dispose() {
        this.latestRequestIdByChunk.clear();
        this.pendingResultsByChunk.clear();
        this.startedAtByRequestId.clear();
        this.worker.terminate();
    }
}
