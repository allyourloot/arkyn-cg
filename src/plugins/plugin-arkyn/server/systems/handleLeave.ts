import type { ArkynState } from "../../shared";
import { Logger } from "@core/shared/utils";
import { removePouch } from "../resources/playerPouch";
import type { ArkynContext } from "../types/ArkynContext";
import { finalizeRun } from "../utils/finalizeRun";
import { removeRunStats } from "../resources/runStats";

const logger = new Logger("ArkynLeave");

export function handleLeave(
    state: ArkynState,
    client: { sessionId: string },
    ctx: ArkynContext,
): void {
    // Capture the run's final round BEFORE we delete the player so
    // finalizeRun records the right value.
    const currentRound = state.players.get(client.sessionId)?.currentRound ?? 0;

    // Finalize any active run before cleanup
    finalizeRun(client.sessionId, ctx, currentRound);
    removeRunStats(client.sessionId);

    state.players.delete(client.sessionId);
    removePouch(client.sessionId);
    logger.info(`Player ${client.sessionId} left, state cleaned up`);
}
