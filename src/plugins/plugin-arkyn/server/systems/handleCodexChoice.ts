import { type ArkynState, getScrollLevelsPerUse } from "../../shared";
import { Logger } from "@core/shared/utils";
import { clearArraySchema } from "../utils/clearArraySchema";
import { getActiveSigils } from "../utils/sigils";
import { requirePlayer } from "./utils/requirePlayer";

const logger = new Logger("ArkynCodexChoice");

/**
 * Handle the player's response to the Codex Pack picker.
 *
 * Payload shape:
 *   { index: number | null }
 *     number -> Select that scroll (grants +N scroll level for the element)
 *     null   -> Skip (no scroll granted, no refund)
 */
export function handleCodexChoice(
    state: ArkynState,
    client: { sessionId: string },
    payload: unknown,
): void {
    const player = requirePlayer({
        state, client, logger,
        action: "Codex choice",
        allowedPhases: ["shop"],
        onMissingPlayer: "silent",
    });
    if (!player) return;

    if (player.pendingCodexScrolls.length === 0) {
        logger.warn(`Codex choice rejected: no pack is open for ${client.sessionId}`);
        return;
    }

    const data = payload as { index?: number | null };
    const index = data?.index;

    // Skip path — clear the picker and return.
    if (index === null || index === undefined) {
        clearArraySchema(player.pendingCodexScrolls);
        logger.info(`Player ${client.sessionId} skipped Codex Pack.`);
        return;
    }

    if (typeof index !== "number" || index < 0 || index >= player.pendingCodexScrolls.length) {
        logger.warn(`Codex choice rejected: invalid index ${index}`);
        return;
    }

    const element = player.pendingCodexScrolls[index];
    const currentLevel = player.scrollLevels.get(element) ?? 0;
    const levelsGained = getScrollLevelsPerUse(getActiveSigils(player));
    const newLevel = currentLevel + levelsGained;
    player.scrollLevels.set(element, newLevel);

    clearArraySchema(player.pendingCodexScrolls);

    logger.info(
        `Player ${client.sessionId} picked ${element} scroll from Codex Pack ` +
        `(level ${newLevel}${levelsGained > 1 ? `, +${levelsGained}` : ""}).`,
    );
}
