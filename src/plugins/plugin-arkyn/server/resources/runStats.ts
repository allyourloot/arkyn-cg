import { createEmptyRunStats, type ArkynRunStats } from "../types/ArkynSaveData";

/** Server-only storage for each player's in-run stats (keyed by sessionId). */
const activeRunStats = new Map<string, ArkynRunStats>();

export function getRunStats(sessionId: string): ArkynRunStats | undefined {
    return activeRunStats.get(sessionId);
}

export function initRunStats(sessionId: string): ArkynRunStats {
    const stats = createEmptyRunStats();
    activeRunStats.set(sessionId, stats);
    return stats;
}

export function removeRunStats(sessionId: string): void {
    activeRunStats.delete(sessionId);
}
