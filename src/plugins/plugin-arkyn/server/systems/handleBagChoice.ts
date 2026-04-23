import { type ArkynState } from "../../shared";
import { Logger } from "@core/shared/utils";
import { clearArraySchema } from "../utils/clearArraySchema";
import { createRuneInstance, syncPlayerPouch } from "../utils/drawRunes";
import { getPouch } from "../resources/playerPouch";
import { nextRuneId } from "../utils/nextRuneId";

const logger = new Logger("ArkynBagChoice");

/**
 * Handle the player's response to the Rune Bag picker.
 *
 * Payload shape:
 *   { index: number | null }
 *     number -> Select that rune (added permanently to pouch this run)
 *     null   -> Skip (no rune added, no refund)
 */
export function handleBagChoice(
    state: ArkynState,
    client: { sessionId: string },
    payload: unknown,
): void {
    const player = state.players.get(client.sessionId);
    if (!player) return;

    if (player.gamePhase !== "shop") {
        logger.warn(`Bag choice rejected: game phase is ${player.gamePhase}`);
        return;
    }

    if (player.pendingBagRunes.length === 0) {
        logger.warn(`Bag choice rejected: no bag is open for ${client.sessionId}`);
        return;
    }

    const data = payload as { index?: number | null };
    const index = data?.index;

    // Skip path — clear the picker and return.
    if (index === null || index === undefined) {
        clearArraySchema(player.pendingBagRunes);
        logger.info(`Player ${client.sessionId} skipped Rune Bag.`);
        return;
    }

    if (typeof index !== "number" || index < 0 || index >= player.pendingBagRunes.length) {
        logger.warn(`Bag choice rejected: invalid index ${index}`);
        return;
    }

    const picked = player.pendingBagRunes[index];

    // Permanent record — will be rehydrated by createPouch every round.
    player.acquiredRunes.push(createRuneInstance(picked));

    // Immediate live add — push into the resource pouch and re-sync so
    // the shop-phase pouch counter ticks +1 right now. A fresh id keeps
    // the live rune distinct from the `acquiredRunes` copy (which will
    // itself get a new id when next round's pouch is rebuilt).
    const pouch = getPouch(client.sessionId);
    if (pouch) {
        pouch.push({
            id: nextRuneId(),
            element: picked.element,
            rarity: picked.rarity,
            level: picked.level,
        });
        player.pouchSize = pouch.length;
        syncPlayerPouch(player, pouch);
    }

    clearArraySchema(player.pendingBagRunes);

    logger.info(
        `Player ${client.sessionId} picked a ${picked.rarity} ${picked.element} rune. ` +
        `Pouch size now ${player.pouchSize}.`,
    );
}
