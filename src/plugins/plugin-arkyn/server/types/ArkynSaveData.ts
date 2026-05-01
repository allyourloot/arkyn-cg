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
    /** Sigils acquired during this run (count, not unique). Drives "First Sigil"
     *  achievements that should fire on the first acquire of a fresh run. */
    sigilsAcquiredThisRun: number;
    /** Peak observed sigil-bar size during this run. Drives the "Pure Run"
     *  challenge (must remain 0 across the entire run). */
    maxSigilsHeld: number;
    /** Peak rune count played in any single cast this run. */
    maxRunesPlayedInCast: number;
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
        /** Lifetime Rune Pack opens. Drives the "Pouchsmith" achievement. */
        runePacksOpened: number;
        /** Lifetime Augury Pack opens. Drives the "Diviner" achievement. */
        auguryPacksOpened: number;
        /** Lifetime sigils sold back to the shop. Drives the "Reseller" achievement. */
        sigilsSold: number;
        /** Per-element cast counter. Keys are ElementType strings; values are
         *  the lifetime number of casts whose dominant element was that
         *  element. Drives the "Element Scholar" achievement (a spell of every
         *  element). */
        elementsCast: Record<string, number>;
    };
    /** Bounded list of recent completed runs (newest first, max 15). */
    recentRuns: ArkynRunStats[];
    /**
     * Unlocked achievements keyed by id. Each entry records when the
     * achievement was unlocked (epoch ms) so the modal can sort or display
     * dates if we ever want it. The presence of an entry is the canonical
     * "unlocked" signal — never delete entries (re-unlocking would re-fire
     * the flyout, which would be confusing).
     */
    achievements: Record<string, { unlockedAt: number }>;
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
            runePacksOpened: 0,
            auguryPacksOpened: 0,
            sigilsSold: 0,
            elementsCast: {},
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
        lt.runePacksOpened ??= 0;
        lt.auguryPacksOpened ??= 0;
        lt.sigilsSold ??= 0;
        lt.elementsCast ??= {};
    }
    if (!Array.isArray(raw.recentRuns)) {
        raw.recentRuns = [];
    }
    if (!raw.achievements || typeof raw.achievements !== "object") {
        raw.achievements = {};
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
        sigilsAcquiredThisRun: 0,
        maxSigilsHeld: 0,
        maxRunesPlayedInCast: 0,
        startedAt: Date.now(),
        endedAt: 0,
    };
}
