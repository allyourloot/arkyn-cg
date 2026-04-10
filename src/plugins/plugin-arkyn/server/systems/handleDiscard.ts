import { type ArkynState } from "../../shared";
import { Logger } from "@core/shared/utils";
import { refillHand } from "../utils/refillHand";
import { removeRunesFromHand, validateRuneSelection } from "./utils/runeSelection";
import { getRunStats } from "../resources/runStats";

const logger = new Logger("ArkynDiscard");

export function handleDiscard(
    state: ArkynState,
    client: { sessionId: string },
    payload: unknown,
): void {
    const result = validateRuneSelection(state, client, payload, {
        logger,
        action: "Discard",
        budgetField: "discardsRemaining",
    });
    if (!result) return;
    const { player, indices } = result;

    // Remove discarded runes from hand
    removeRunesFromHand(player, indices);

    // Draw replacements
    refillHand(player, client.sessionId);

    player.discardsRemaining--;

    // Track discard in run stats
    const stats = getRunStats(client.sessionId);
    if (stats) stats.totalDiscards++;

    logger.info(`Player ${client.sessionId} discarded ${indices.length} runes. Discards remaining: ${player.discardsRemaining}`);
}
