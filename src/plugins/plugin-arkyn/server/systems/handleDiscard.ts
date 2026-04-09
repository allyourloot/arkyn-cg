import { HAND_SIZE, MAX_PLAY, type ArkynState } from "../../shared";
import { Logger } from "@core/shared/utils";
import { drawRunes, syncPlayerPouch } from "../utils/drawRunes";
import { getPouch } from "../resources/playerPouch";

const logger = new Logger("ArkynDiscard");

export function handleDiscard(
    state: ArkynState,
    client: { sessionId: string },
    payload: unknown,
): void {
    if (state.gamePhase !== "playing") {
        logger.warn(`Discard rejected: game phase is ${state.gamePhase}`);
        return;
    }

    const player = state.players.get(client.sessionId);
    if (!player) {
        logger.warn(`Discard rejected: player ${client.sessionId} not found`);
        return;
    }

    if (player.discardsRemaining <= 0) {
        logger.warn(`Discard rejected: no discards remaining`);
        return;
    }

    // Validate payload
    const data = payload as { selectedIndices?: number[] };
    const indices = data?.selectedIndices;
    if (!Array.isArray(indices) || indices.length === 0 || indices.length > MAX_PLAY) {
        logger.warn(`Discard rejected: invalid indices`);
        return;
    }

    // Validate indices
    const handSize = player.hand.length;
    for (const idx of indices) {
        if (!Number.isInteger(idx) || idx < 0 || idx >= handSize) {
            logger.warn(`Discard rejected: index ${idx} out of bounds`);
            return;
        }
    }

    if (new Set(indices).size !== indices.length) {
        logger.warn(`Discard rejected: duplicate indices`);
        return;
    }

    // Remove discarded runes from hand (reverse order to preserve indices)
    const sortedIndices = [...indices].sort((a, b) => b - a);
    for (const idx of sortedIndices) {
        player.hand.splice(idx, 1);
    }

    // Draw replacements
    const pouch = getPouch(client.sessionId);
    if (pouch && player.hand.length < HAND_SIZE) {
        const toDraw = HAND_SIZE - player.hand.length;
        const drawn = drawRunes(pouch, toDraw);
        for (const rune of drawn) {
            player.hand.push(rune);
        }
        player.pouchSize = pouch.length;
        syncPlayerPouch(player, pouch);
    }

    player.discardsRemaining--;

    logger.info(`Player ${client.sessionId} discarded ${indices.length} runes. Discards remaining: ${player.discardsRemaining}`);
}
