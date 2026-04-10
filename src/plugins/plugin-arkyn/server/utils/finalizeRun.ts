import { Logger } from "@core/shared/utils";
import type { ArkynContext } from "../types/ArkynContext";
import { getRunStats, removeRunStats } from "../resources/runStats";

const logger = new Logger("ArkynFinalize");

const MAX_RECENT_RUNS = 15;

/**
 * Finalize the current run: merge ephemeral run stats into the player's
 * persisted save data and clean up the in-memory run stats entry.
 *
 * Safe to call when save-states is unavailable (dev mode) — early-returns
 * if there's no save data to write to.
 */
export function finalizeRun(
    sessionId: string,
    ctx: ArkynContext,
    currentRound: number,
): void {
    const stats = getRunStats(sessionId);
    if (!stats) return;

    stats.roundReached = currentRound;
    stats.endedAt = Date.now();

    const saveData = ctx.getSaveData(sessionId);
    if (saveData) {
        const lt = saveData.lifetime;

        // Update bests
        lt.highestRound = Math.max(lt.highestRound, stats.roundReached);
        lt.highestSingleCastDamage = Math.max(lt.highestSingleCastDamage, stats.highestSingleCastDamage);

        // Accumulate totals
        lt.totalDamageDealt += stats.totalDamage;
        lt.totalCasts += stats.totalCasts;
        lt.totalDiscards += stats.totalDiscards;
        lt.totalRuns++;
        lt.totalEnemiesDefeated += stats.enemiesDefeated;
        lt.totalGoldEarned += stats.goldEarned;

        // Merge spell usage
        for (const [spell, count] of Object.entries(stats.spellUsage)) {
            lt.spellUsage[spell] = (lt.spellUsage[spell] ?? 0) + count;
        }

        // Recompute all-time favorite spell
        let maxCount = 0;
        for (const [spell, count] of Object.entries(lt.spellUsage)) {
            if (count > maxCount) {
                maxCount = count;
                lt.favoriteSpell = spell;
            }
        }

        // Add to recent runs (newest first, bounded)
        saveData.recentRuns.unshift({ ...stats });
        if (saveData.recentRuns.length > MAX_RECENT_RUNS) {
            saveData.recentRuns.length = MAX_RECENT_RUNS;
        }

        logger.info(`Finalized run for session ${sessionId}: round ${stats.roundReached}, ${stats.totalDamage} total damage`);
    }

    removeRunStats(sessionId);
}
