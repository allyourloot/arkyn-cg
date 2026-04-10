import { ArkynPlayerState, type ArkynState } from "../../shared";
import { Logger } from "@core/shared/utils";
import { removePouch } from "../resources/playerPouch";
import { initPlayerForRound } from "../utils/initPlayerForRound";
import { spawnEnemy } from "./handleJoin";

const logger = new Logger("ArkynNewRun");

export function handleNewRun(
    state: ArkynState,
    client: { sessionId: string },
): void {
    if (state.gamePhase !== "game_over") {
        logger.warn(`New run rejected: game phase is ${state.gamePhase}`);
        return;
    }

    // Clean up old player state
    if (state.players.has(client.sessionId)) {
        state.players.delete(client.sessionId);
        removePouch(client.sessionId);
    }

    // Fresh player — gold resets to 0 for the new run
    const player = new ArkynPlayerState();
    state.players.set(client.sessionId, player);
    initPlayerForRound(player, client.sessionId);

    // Reset to round 1 with a new enemy
    state.currentRound = 1;
    spawnEnemy(state);

    state.gamePhase = "playing";

    logger.info(`Player ${client.sessionId} started a new run.`);
}
