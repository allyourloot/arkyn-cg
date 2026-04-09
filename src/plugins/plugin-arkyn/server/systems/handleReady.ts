import { type ArkynState } from "../../shared";
import { Logger } from "@core/shared/utils";
import { initPlayerForRound } from "../utils/initPlayerForRound";
import { spawnEnemy } from "./handleJoin";

const logger = new Logger("ArkynReady");

export function handleReady(
    state: ArkynState,
    client: { sessionId: string },
): void {
    if (state.gamePhase !== "round_end") {
        logger.warn(`Ready rejected: game phase is ${state.gamePhase}`);
        return;
    }

    const player = state.players.get(client.sessionId);
    if (!player) {
        logger.warn(`Ready rejected: player ${client.sessionId} not found`);
        return;
    }

    // Next round — reset player and spawn the next enemy
    state.currentRound++;
    initPlayerForRound(player, client.sessionId);
    spawnEnemy(state);

    state.gamePhase = "playing";

    logger.info(`Round ${state.currentRound} started. Enemy: ${state.enemy.name} (HP: ${state.enemy.maxHp})`);
}
