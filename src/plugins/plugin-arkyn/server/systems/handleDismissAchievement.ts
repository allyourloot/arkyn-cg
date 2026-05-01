import { type ArkynState } from "../../shared";
import { Logger } from "@core/shared/utils";

const logger = new Logger("ArkynDismissAchievement");

/**
 * Pop the matching AchievementFlyout entry from the player's queue.
 * Idempotent: a missing seq is silently ignored — the entry was either
 * already dismissed or cleared on reconnect.
 */
export function handleDismissAchievement(
    state: ArkynState,
    client: { sessionId: string },
    payload: unknown,
): void {
    const player = state.players.get(client.sessionId);
    if (!player) return;

    const data = payload as { seq?: number };
    const seq = data?.seq;
    if (typeof seq !== "number") return;

    const idx = Array.from(player.pendingAchievementFlyouts).findIndex(f => f.seq === seq);
    if (idx < 0) return;

    player.pendingAchievementFlyouts.splice(idx, 1);
    logger.info(`Player ${client.sessionId} dismissed achievement flyout seq=${seq}`);
}
