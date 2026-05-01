import {
    ACHIEVEMENT_DEFINITIONS,
    AchievementFlyout,
    elementsCastToBitmask,
    type AchievementContext,
    type AchievementTrigger,
    type ArkynPlayerState,
} from "../../shared";
import { Logger } from "@core/shared/utils";
import type { ArkynContext } from "../types/ArkynContext";
import { getRunStats } from "../resources/runStats";

const logger = new Logger("ArkynAchievements");

/** Per-session monotonic seq counter for AchievementFlyout entries. */
const seqCounters = new Map<string, number>();

function nextSeq(sessionId: string): number {
    const cur = (seqCounters.get(sessionId) ?? 0) + 1;
    seqCounters.set(sessionId, cur);
    return cur;
}

export function clearAchievementSeq(sessionId: string): void {
    seqCounters.delete(sessionId);
}

interface EvaluateExtra {
    cast?: AchievementContext["cast"];
    enemyDefeat?: AchievementContext["enemyDefeat"];
    pack?: AchievementContext["pack"];
}

/**
 * Run all achievement predicates whose `triggers` include the given trigger,
 * persist newly unlocked ones into save data, queue flyout entries on the
 * player schema, and return the list of newly-unlocked ids.
 *
 * Safe when save-states is unavailable — predicates that depend on lifetime
 * stats simply read zeros and never unlock, so dev mode without persistence
 * just doesn't grant achievements (no crash, no progress lost).
 */
export function evaluateAchievements(
    sessionId: string,
    player: ArkynPlayerState,
    ctx: ArkynContext,
    trigger: AchievementTrigger,
    extra: EvaluateExtra = {},
): string[] {
    const saveData = ctx.getSaveData(sessionId);
    const stats = getRunStats(sessionId);

    // Build the predicate context once and reuse across every definition.
    const acCtx: AchievementContext = {
        trigger,
        lifetime: saveData
            ? {
                totalCasts: saveData.lifetime.totalCasts,
                totalDiscards: saveData.lifetime.totalDiscards,
                totalRuns: saveData.lifetime.totalRuns,
                totalEnemiesDefeated: saveData.lifetime.totalEnemiesDefeated,
                totalGoldEarned: saveData.lifetime.totalGoldEarned,
                runePacksOpened: saveData.lifetime.runePacksOpened,
                auguryPacksOpened: saveData.lifetime.auguryPacksOpened,
                sigilsSold: saveData.lifetime.sigilsSold,
                elementsCast: saveData.lifetime.elementsCast,
            }
            : null,
        run: stats
            ? {
                roundReached: stats.roundReached || player.currentRound,
                totalDamage: stats.totalDamage,
                highestSingleCastDamage: stats.highestSingleCastDamage,
                enemiesDefeated: stats.enemiesDefeated,
                sigilsAcquiredThisRun: stats.sigilsAcquiredThisRun,
                maxSigilsHeld: stats.maxSigilsHeld,
                maxRunesPlayedInCast: stats.maxRunesPlayedInCast,
            }
            : null,
        cast: extra.cast ?? null,
        enemyDefeat: extra.enemyDefeat ?? null,
        pack: extra.pack ?? null,
        ownedSigilCount: player.sigils.length,
    };

    const newlyUnlocked: string[] = [];
    const alreadyUnlocked = saveData?.achievements ?? null;

    for (const def of Object.values(ACHIEVEMENT_DEFINITIONS)) {
        // Cheap skip: this definition isn't keyed off this trigger.
        if (!def.triggers.includes(trigger)) continue;
        // Already-unlocked check — works without save data too (the
        // schema list is the in-memory mirror).
        if (alreadyUnlocked && alreadyUnlocked[def.id]) continue;
        if (Array.from(player.unlockedAchievements).includes(def.id)) continue;
        let matched = false;
        try {
            matched = def.evaluate(acCtx);
        } catch (err) {
            logger.warn(`Achievement "${def.id}" predicate threw: ${(err as Error).message}`);
            continue;
        }
        if (!matched) continue;

        const unlockedAt = Date.now();
        if (saveData) {
            saveData.achievements[def.id] = { unlockedAt };
        }
        player.unlockedAchievements.push(def.id);

        const fly = new AchievementFlyout();
        fly.seq = nextSeq(sessionId);
        fly.id = def.id;
        fly.name = def.name;
        fly.description = def.description;
        fly.unlocksSigilId = def.unlocksSigilId ?? "";
        player.pendingAchievementFlyouts.push(fly);

        newlyUnlocked.push(def.id);
        logger.info(
            `Player ${sessionId} unlocked achievement "${def.id}" (${def.name})` +
            (def.unlocksSigilId ? ` — unlocks sigil "${def.unlocksSigilId}"` : ""),
        );
    }

    return newlyUnlocked;
}

/**
 * Mirror lifetime save-data totals onto the player schema so the client
 * achievements modal can render progress without an extra round-trip.
 * Cheap to call — just integer copies + a bitmask. Call after every
 * mutation to lifetime stats so the schema stays in sync.
 */
export function syncLifetimeToSchema(
    player: ArkynPlayerState,
    ctx: ArkynContext,
    sessionId: string,
): void {
    const saveData = ctx.getSaveData(sessionId);
    if (!saveData) return;
    const lt = saveData.lifetime;
    player.lifetimeTotalCasts = lt.totalCasts;
    player.lifetimeTotalDiscards = lt.totalDiscards;
    player.lifetimeTotalRuns = lt.totalRuns;
    player.lifetimeTotalEnemiesDefeated = lt.totalEnemiesDefeated;
    player.lifetimeTotalGoldEarned = lt.totalGoldEarned;
    player.lifetimeRunePacksOpened = lt.runePacksOpened;
    player.lifetimeAuguryPacksOpened = lt.auguryPacksOpened;
    player.lifetimeSigilsSold = lt.sigilsSold;
    player.lifetimeElementsCastMask = elementsCastToBitmask(lt.elementsCast);
}

/**
 * Populate the player's `unlockedAchievements` ArraySchema from save data.
 * Called on join — the schema is empty for fresh ArkynPlayerState
 * instances, so we re-fill from the persisted set.
 */
export function loadUnlockedAchievementsFromSave(
    player: ArkynPlayerState,
    ctx: ArkynContext,
    sessionId: string,
): void {
    const saveData = ctx.getSaveData(sessionId);
    if (!saveData) return;
    for (const id of Object.keys(saveData.achievements)) {
        player.unlockedAchievements.push(id);
    }
}
