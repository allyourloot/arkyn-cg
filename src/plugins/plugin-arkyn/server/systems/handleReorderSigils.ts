import { type ArkynState } from "../../shared";
import { Logger } from "@core/shared/utils";
import { requirePlayer } from "./utils/requirePlayer";

const logger = new Logger("ArkynReorderSigils");

/**
 * Move a sigil from `fromIndex` to `toIndex` within the player's
 * sigil bar. Sigil order is load-bearing — Mimic copies whatever sits
 * at index N+1, so the player reshaping their bar can change which
 * sigil Mimic is currently duplicating.
 *
 * Rejects invalid index ranges (out-of-bounds, swap-with-self) with a
 * warn log rather than an error. Colyseus Schema's `ArraySchema#splice`
 * preserves entry identity, so no accompanying accumulator / consumable
 * reshuffling is needed — the sigil id is stable across positions.
 */
export function handleReorderSigils(
    state: ArkynState,
    client: { sessionId: string },
    payload: unknown,
): void {
    const player = requirePlayer({ state, client, logger, action: "Reorder" });
    if (!player) return;

    const data = payload as { fromIndex?: unknown; toIndex?: unknown };
    const fromIndex = data?.fromIndex;
    const toIndex = data?.toIndex;
    if (typeof fromIndex !== "number" || typeof toIndex !== "number") {
        logger.warn(`Reorder rejected: invalid payload`);
        return;
    }
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
        logger.warn(`Reorder rejected: non-integer indices`);
        return;
    }
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= player.sigils.length) {
        logger.warn(`Reorder rejected: fromIndex ${fromIndex} out of range`);
        return;
    }
    if (toIndex < 0 || toIndex >= player.sigils.length) {
        logger.warn(`Reorder rejected: toIndex ${toIndex} out of range`);
        return;
    }

    // Compute the reordered list as a plain array, then write back to
    // the ArraySchema via index assignment. Colyseus ArraySchema's
    // 3-arg `splice(index, 0, item)` insert form crashes the server
    // ("Inserting more elements than the length"), so we avoid it
    // entirely — assigning by index sends a compact per-cell delta and
    // never grows the array beyond its current length.
    const order = Array.from(player.sigils);
    const [moved] = order.splice(fromIndex, 1);
    order.splice(toIndex, 0, moved);

    for (let i = 0; i < order.length; i++) {
        if (player.sigils[i] !== order[i]) {
            player.sigils[i] = order[i];
        }
    }

    logger.info(
        `Player ${client.sessionId} reordered sigil "${moved}" from ${fromIndex} to ${toIndex}.`,
    );
}
