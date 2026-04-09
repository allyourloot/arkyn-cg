import { MAX_PLAY, type ArkynPlayerState, type ArkynState } from "../../../shared";
import type { Logger } from "@core/shared/utils";

export interface ValidatedRuneSelection {
    player: ArkynPlayerState;
    indices: number[];
}

export interface ValidateRuneSelectionOptions {
    logger: Logger;
    /** Display name used in rejection log messages, e.g. "Cast" or "Discard". */
    action: string;
    /** Which per-player action budget to consume — must be > 0 to proceed. */
    budgetField: "castsRemaining" | "discardsRemaining";
}

/**
 * Shared validation for handlers that take a `{ selectedIndices: number[] }`
 * payload referencing positions in the player's hand. Returns the resolved
 * player + indices on success, or null after logging the rejection reason.
 *
 * Used by handleCast and handleDiscard. Centralizing this means a single
 * place to update the validation contract (e.g. payload shape, bounds rules).
 */
export function validateRuneSelection(
    state: ArkynState,
    client: { sessionId: string },
    payload: unknown,
    options: ValidateRuneSelectionOptions,
): ValidatedRuneSelection | null {
    const { logger, action, budgetField } = options;

    if (state.gamePhase !== "playing") {
        logger.warn(`${action} rejected: game phase is ${state.gamePhase}`);
        return null;
    }

    const player = state.players.get(client.sessionId);
    if (!player) {
        logger.warn(`${action} rejected: player ${client.sessionId} not found`);
        return null;
    }

    if (player[budgetField] <= 0) {
        logger.warn(`${action} rejected: no ${budgetField} remaining`);
        return null;
    }

    const data = payload as { selectedIndices?: number[] };
    const indices = data?.selectedIndices;
    if (!Array.isArray(indices) || indices.length === 0 || indices.length > MAX_PLAY) {
        logger.warn(`${action} rejected: invalid indices`);
        return null;
    }

    const handSize = player.hand.length;
    for (const idx of indices) {
        if (!Number.isInteger(idx) || idx < 0 || idx >= handSize) {
            logger.warn(`${action} rejected: index ${idx} out of bounds (hand size ${handSize})`);
            return null;
        }
    }

    if (new Set(indices).size !== indices.length) {
        logger.warn(`${action} rejected: duplicate indices`);
        return null;
    }

    return { player, indices };
}

/**
 * Remove runes at the given hand indices. Splices in reverse order so each
 * removal preserves the validity of later (lower-numbered) indices.
 */
export function removeRunesFromHand(player: ArkynPlayerState, indices: number[]): void {
    const sorted = [...indices].sort((a, b) => b - a);
    for (const idx of sorted) {
        player.hand.splice(idx, 1);
    }
}
