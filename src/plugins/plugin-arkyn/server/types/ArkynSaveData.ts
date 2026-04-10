/** Stats accumulated during a single run (ephemeral until finalized). */
export interface ArkynRunStats {
    roundReached: number;
    totalDamage: number;
    totalCasts: number;
    totalDiscards: number;
    highestSingleCastDamage: number;
    /** spellName -> cast count */
    spellUsage: Record<string, number>;
    goldEarned: number;
    enemiesDefeated: number;
    startedAt: number;
    endedAt: number;
}

/** Persisted player save data stored in the KV store. */
export interface ArkynSaveData {
    lifetime: {
        highestRound: number;
        highestSingleCastDamage: number;
        totalDamageDealt: number;
        totalCasts: number;
        totalDiscards: number;
        totalRuns: number;
        totalEnemiesDefeated: number;
        totalGoldEarned: number;
        favoriteSpell: string;
        spellUsage: Record<string, number>;
    };
    /** Bounded list of recent completed runs (newest first, max 15). */
    recentRuns: ArkynRunStats[];
}

/**
 * Defensively initialize save data fields on a raw object from the KV
 * store. Handles first-time players (empty object) and future field
 * additions (missing keys get defaults).
 */
export function ensureArkynSaveData(raw: Record<string, unknown>): ArkynSaveData {
    if (!raw.lifetime || typeof raw.lifetime !== "object") {
        raw.lifetime = {
            highestRound: 0,
            highestSingleCastDamage: 0,
            totalDamageDealt: 0,
            totalCasts: 0,
            totalDiscards: 0,
            totalRuns: 0,
            totalEnemiesDefeated: 0,
            totalGoldEarned: 0,
            favoriteSpell: "",
            spellUsage: {},
        };
    } else {
        const lt = raw.lifetime as Record<string, unknown>;
        lt.highestRound ??= 0;
        lt.highestSingleCastDamage ??= 0;
        lt.totalDamageDealt ??= 0;
        lt.totalCasts ??= 0;
        lt.totalDiscards ??= 0;
        lt.totalRuns ??= 0;
        lt.totalEnemiesDefeated ??= 0;
        lt.totalGoldEarned ??= 0;
        lt.favoriteSpell ??= "";
        lt.spellUsage ??= {};
    }
    if (!Array.isArray(raw.recentRuns)) {
        raw.recentRuns = [];
    }
    return raw as unknown as ArkynSaveData;
}

export function createEmptyRunStats(): ArkynRunStats {
    return {
        roundReached: 0,
        totalDamage: 0,
        totalCasts: 0,
        totalDiscards: 0,
        highestSingleCastDamage: 0,
        spellUsage: {},
        goldEarned: 0,
        enemiesDefeated: 0,
        startedAt: Date.now(),
        endedAt: 0,
    };
}
