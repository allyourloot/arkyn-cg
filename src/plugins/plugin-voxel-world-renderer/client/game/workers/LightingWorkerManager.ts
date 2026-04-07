import type {
    ComputeLightingRequest,
    LightingWorkerResponse,
    NeighborChunks,
} from "./lightingWorkerTypes";

export type LightingResultCallback = (
    chunkIndex: number,
    sectionIndexes: number[],
    sunLightSections: Uint8Array,
) => void;

export class LightingWorkerManager {
    private readonly worker: Worker;
    private onResult: LightingResultCallback | null = null;
    private readonly latestRequestIdByChunk = new Map<number, number>();
    private nextRequestId = 1;

    constructor() {
        this.worker = new Worker(
            new URL("./lightingWorker.js", import.meta.url),
            { type: "module" },
        );

        this.worker.onmessage = (e: MessageEvent<LightingWorkerResponse>) => {
            const msg = e.data;

            switch (msg.type) {
                case "lightingResult":
                    if (this.latestRequestIdByChunk.get(msg.chunkIndex) !== msg.requestId) {
                        break;
                    }
                    this.onResult?.(msg.chunkIndex, msg.sectionIndexes, msg.sunLightSections);
                    break;
            }
        };
    }

    public setResultCallback(cb: LightingResultCallback) {
        this.onResult = cb;
    }

    public submitChunk(
        chunkIndex: number,
        chunkX: number,
        chunkZ: number,
        sectionIndexes: number[],
        blocks: number[],
        heightmap: number[],
        highestEverBlockY: number,
        lowestEverBlockY: number,
        neighbors: NeighborChunks,
        transparentBlockIds: number[],
    ) {
        const requestId = this.nextRequestId++;
        this.latestRequestIdByChunk.set(chunkIndex, requestId);

        const msg: ComputeLightingRequest = {
            type: "computeLighting",
            requestId,
            chunkIndex,
            chunkX,
            chunkZ,
            sectionIndexes,
            blocks,
            heightmap,
            highestEverBlockY,
            lowestEverBlockY,
            neighbors,
            transparentBlockIds,
        };

        this.worker.postMessage(msg);
    }

    public dispose() {
        this.latestRequestIdByChunk.clear();
        this.worker.terminate();
    }
}
