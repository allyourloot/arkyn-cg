import { ArkynPlayerState, type ArkynState } from "../../shared";
import { Logger } from "@core/shared/utils";
import { removePouch } from "../resources/playerPouch";
import { initPlayerForRound } from "../utils/initPlayerForRound";
import { spawnEnemy, applyBossDebuff } from "./handleJoin";
import { generateRunSeed } from "../../shared/seededRandom";
import type { ArkynContext } from "../types/ArkynContext";
import { initRunStats } from "../resources/runStats";
import { finalizeRun } from "../utils/finalizeRun";

const logger = new Logger("ArkynNewRun");

export function handleNewRun(
    state: ArkynState,
    client: { sessionId: string },
    ctx: ArkynContext,
): void {
    // Capture the old run's final round BEFORE the player is deleted so
    // finalizeRun still has a meaningful currentRound value.
    const oldPlayer = state.players.get(client.sessionId);
    if (!oldPlayer) {
        logger.warn(`New run rejected: player ${client.sessionId} not found`);
        return;
    }
    if (oldPlayer.gamePhase !== "game_over") {
        logger.warn(`New run rejected: game phase is ${oldPlayer.gamePhase}`);
        return;
    }
    const oldRound = oldPlayer.currentRound;

    // Finalize the old run stats (already done in handleCast on game_over,
    // but safe to call again — getRunStats returns undefined after removal)
    finalizeRun(client.sessionId, ctx, oldRound);

    // Clean up old player state
    state.players.delete(client.sessionId);
    removePouch(client.sessionId);

    // Fresh player — gold resets to 0 for the new run
    const player = new ArkynPlayerState();
    state.players.set(client.sessionId, player);
    initPlayerForRound(player, client.sessionId);

    // Initialize fresh run stats
    initRunStats(client.sessionId);

    // Load updated personal bests from save data
    const saveData = ctx.getSaveData(client.sessionId);
    if (saveData) {
        player.bestRound = saveData.lifetime.highestRound;
        player.bestSingleCast = saveData.lifetime.highestSingleCastDamage;
    }

    // Fresh seed + round 1 enemy
    player.runSeed = generateRunSeed();
    player.currentRound = 1;
    spawnEnemy(player, player.currentRound, player.runSeed);
    applyBossDebuff(player);

    player.gamePhase = "playing";

    logger.info(`Player ${client.sessionId} started a new run. Seed: ${player.runSeed}`);
}
