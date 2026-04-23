import { type ArkynState } from "../../shared";
import { Logger } from "@core/shared/utils";
import { SHOP_ITEM_HANDLERS } from "./shopItemHandlers";

const logger = new Logger("ArkynBuyItem");

export function handleBuyItem(
    state: ArkynState,
    client: { sessionId: string },
    payload: unknown,
): void {
    const player = state.players.get(client.sessionId);
    if (!player) {
        logger.warn(`Buy rejected: player ${client.sessionId} not found`);
        return;
    }

    if (player.gamePhase !== "shop") {
        logger.warn(`Buy rejected: game phase is ${player.gamePhase}`);
        return;
    }

    const data = payload as { shopIndex?: number };
    const shopIndex = data?.shopIndex;
    if (typeof shopIndex !== "number" || shopIndex < 0 || shopIndex >= player.shopItems.length) {
        logger.warn(`Buy rejected: invalid shop index ${shopIndex}`);
        return;
    }

    const item = player.shopItems[shopIndex];
    if (!item || item.purchased) {
        logger.warn(`Buy rejected: item at index ${shopIndex} already purchased or missing`);
        return;
    }

    if (player.gold < item.cost) {
        logger.warn(`Buy rejected: insufficient gold (${player.gold} < ${item.cost})`);
        return;
    }

    const handler = SHOP_ITEM_HANDLERS[item.itemType];
    if (!handler) {
        logger.warn(`Buy rejected: unknown item type "${item.itemType}"`);
        return;
    }

    // Handlers apply their own type-specific state mutations (or return
    // `ok: false` if a precondition fails). Gold is charged and the item
    // flipped to purchased only after the handler succeeds, so there is
    // no refund path to maintain.
    const result = handler({ state, player, item, sessionId: client.sessionId });
    if (!result.ok) {
        logger.warn(`Buy rejected: ${result.reason}`);
        return;
    }

    player.gold -= item.cost;
    item.purchased = true;
    logger.info(`${result.logMessage} Gold remaining: ${player.gold}`);
}
