import { Logger } from "@core/shared/utils";
import type { ArkynContext } from "../types/ArkynContext";
import { getRunStats, removeRunStats } from "../resources/runStats";

const logger = new Logger("ArkynFinalize");

const MAX_RECENT_RUNS = 15;

/**
 * Finalize the current run: merge ephemeral run stats into the player's
 * persisted save data and clean up the in-memory run stats entry.
 *
 * Note: lifetime running totals (`totalCasts`, `totalDamageDealt`,
 * `totalDiscards`, `totalGoldEarned`, `totalEnemiesDefeated`,
 * `runePacksOpened`, `auguryPacksOpened`, `sigilsSold`, `elementsCast`,
 * `spellUsage`) are bumped INCREMENTALLY by the per-event handlers
 * (`handleCast`, `handleDiscard`, `handleBuyItem`, `handleSellSigil`,
 * `handleCollectRoundGold`) so the achievement evaluator sees fresh
 * lifetime numbers mid-run. This function therefore does NOT re-add
 * those totals — it only:
 *   - bumps `totalRuns` (one per call)
 *   - updates the bests (`highestRound`, `highestSingleCastDamage`)
 *   - recomputes `favoriteSpell` from the now-updated histogram
 *   - pushes a snapshot into `recentRuns`
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

        // Bump completed-run counter. Per-event totals are accumulated
        // incrementally by the handlers — see the docstring above.
        lt.totalRuns++;

        // Recompute all-time favorite spell from the histogram (which
        // handleCast has been updating per-cast).
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
