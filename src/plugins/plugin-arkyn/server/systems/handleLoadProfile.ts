import { ArkynPlayerState, type ArkynState } from "../../shared";
import { Logger } from "@core/shared/utils";
import type { ArkynContext } from "../types/ArkynContext";
import {
    evaluateAchievements,
    loadUnlockedAchievementsFromSave,
    syncLifetimeToSchema,
} from "../utils/evaluateAchievements";

const logger = new Logger("ArkynLoadProfile");

/**
 * Pre-populate a player schema with cross-run profile data (unlocked
 * achievements, lifetime stat snapshot, personal bests) the moment the
 * client connects — BEFORE the user clicks Play. This is what lets the
 * Achievements modal opened from the main menu render real progress
 * rather than the schema defaults.
 *
 * Differences from `handleJoin`:
 *  - leaves `gamePhase = "menu"` (no run-state init)
 *  - does NOT spawn an enemy, generate a runSeed, or build a pouch
 *  - does NOT initialize ephemeral run stats
 *  - is idempotent — re-firing is a no-op once a player exists, so
 *    the existing handleJoin still owns the actual run-start path
 *
 * On Play, `handleJoin` deletes this menu player and creates a fresh
 * "playing" one (re-loading the same achievements/lifetime data) — the
 * brief overwrite is harmless and matches the existing reconnect path.
 */
export function handleLoadProfile(
    state: ArkynState,
    client: { sessionId: string },
    ctx: ArkynContext,
): void {
    if (state.players.has(client.sessionId)) {
        // Already loaded (or upgraded to a real run by handleJoin) —
        // nothing to do. Don't clobber an active player.
        return;
    }

    const player = new ArkynPlayerState();
    state.players.set(client.sessionId, player);
    // Explicit — even though "menu" is the schema default, future schema
    // changes might shift the default and the menu phase is load-bearing
    // for which UI the client renders.
    player.gamePhase = "menu";

    const saveData = ctx.getSaveData(client.sessionId);
    if (saveData) {
        player.bestRound = saveData.lifetime.highestRound;
        player.bestSingleCast = saveData.lifetime.highestSingleCastDamage;
    }

    loadUnlockedAchievementsFromSave(player, ctx, client.sessionId);
    syncLifetimeToSchema(player, ctx, client.sessionId);

    // Retroactive grant pass — same logic as handleJoin's first_load
    // call. Without this, a player with existing lifetime stats from
    // before the achievement system shipped wouldn't see their unlocks
    // until they actually started a run.
    evaluateAchievements(client.sessionId, player, ctx, "first_load");

    logger.info(`Player ${client.sessionId} profile preloaded for menu (gamePhase=menu).`);
}
