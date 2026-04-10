import type { ArkynPlayerState } from "../../shared";
import type { ArkynRunStats } from "../types/ArkynSaveData";

/**
 * Copy ephemeral run stats into the Colyseus schema so they sync to the
 * client for display (game-over screen, mid-game stats, etc.).
 */
export function syncRunStatsToSchema(player: ArkynPlayerState, stats: ArkynRunStats): void {
    player.runTotalDamage = stats.totalDamage;
    player.runTotalCasts = stats.totalCasts;
    player.runTotalDiscards = stats.totalDiscards;
    player.runHighestSingleCast = stats.highestSingleCastDamage;
    player.runEnemiesDefeated = stats.enemiesDefeated;
    player.runGoldEarned = stats.goldEarned;

    // Derive favorite spell from usage map
    let maxCount = 0;
    let favorite = "";
    for (const [spell, count] of Object.entries(stats.spellUsage)) {
        if (count > maxCount) {
            maxCount = count;
            favorite = spell;
        }
    }
    player.runFavoriteSpell = favorite;
}
