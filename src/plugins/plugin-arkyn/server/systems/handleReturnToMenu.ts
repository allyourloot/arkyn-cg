import { ArkynPlayerState, type ArkynState } from "../../shared";
import { Logger } from "@core/shared/utils";
import { removePouch } from "../resources/playerPouch";
import { removeRunStats } from "../resources/runStats";
import { finalizeRun } from "../utils/finalizeRun";
import {
    loadUnlockedAchievementsFromSave,
    syncLifetimeToSchema,
} from "../utils/evaluateAchievements";
import type { ArkynContext } from "../types/ArkynContext";

const logger = new Logger("ArkynReturnToMenu");

/**
 * "Main Menu" button on the Game Over overlay. Abandons the finished
 * run and parks the player in the same menu-only player schema that
 * handleLoadProfile sets up on a fresh connection. From there the user
 * can click Play (handleJoin) to start a brand-new run.
 *
 * Mirrors the cleanup half of handleNewRun but stops short of spawning
 * an enemy or initializing run stats — there's no run to be in.
 */
export function handleReturnToMenu(
    state: ArkynState,
    client: { sessionId: string },
    ctx: ArkynContext,
): void {
    const oldPlayer = state.players.get(client.sessionId);
    if (!oldPlayer) {
        logger.warn(`Return to menu rejected: player ${client.sessionId} not found`);
        return;
    }
    if (oldPlayer.gamePhase !== "game_over") {
        logger.warn(`Return to menu rejected: game phase is ${oldPlayer.gamePhase}`);
        return;
    }
    const oldRound = oldPlayer.currentRound;

    finalizeRun(client.sessionId, ctx, oldRound);
    removeRunStats(client.sessionId);

    state.players.delete(client.sessionId);
    removePouch(client.sessionId);

    const player = new ArkynPlayerState();
    state.players.set(client.sessionId, player);
    player.gamePhase = "menu";

    const saveData = ctx.getSaveData(client.sessionId);
    if (saveData) {
        player.bestRound = saveData.lifetime.highestRound;
        player.bestSingleCast = saveData.lifetime.highestSingleCastDamage;
    }

    loadUnlockedAchievementsFromSave(player, ctx, client.sessionId);
    syncLifetimeToSchema(player, ctx, client.sessionId);

    logger.info(`Player ${client.sessionId} returned to menu from game_over (round ${oldRound}).`);
}
