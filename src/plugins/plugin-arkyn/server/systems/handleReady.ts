import { type ArkynState } from "../../shared";
import { Logger } from "@core/shared/utils";
import { initPlayerForRound } from "../utils/initPlayerForRound";
import { spawnEnemy } from "./handleJoin";

const logger = new Logger("ArkynReady");

/**
 * ARKYN_READY is the single client message that drives both inter-round
 * transitions:
 *
 *   round_end  →  shop     (Continue on the Round Win overlay)
 *   shop       →  playing  (Continue on the Shop screen)
 *
 * Entering the shop is a no-op on the player state — we only flip the
 * phase so the client swaps to the shop layout. Leaving the shop does the
 * real per-round work (round++, reset budgets, fresh pouch/hand, spawn the
 * next enemy).
 */
export function handleReady(
    state: ArkynState,
    client: { sessionId: string },
): void {
    const player = state.players.get(client.sessionId);
    if (!player) {
        logger.warn(`Ready rejected: player ${client.sessionId} not found`);
        return;
    }

    if (state.gamePhase === "round_end") {
        state.gamePhase = "shop";
        logger.info(`Player ${client.sessionId} entered shop`);
        return;
    }

    if (state.gamePhase === "shop") {
        state.currentRound++;
        initPlayerForRound(player, client.sessionId);
        spawnEnemy(state);
        state.gamePhase = "playing";
        logger.info(`Round ${state.currentRound} started. Enemy: ${state.enemy.name} (HP: ${state.enemy.maxHp})`);
        return;
    }

    logger.warn(`Ready rejected: game phase is ${state.gamePhase}`);
}
