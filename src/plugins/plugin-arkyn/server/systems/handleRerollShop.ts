import { type ArkynState, ShopItemState } from "../../shared";
import { REROLL_COST } from "../../shared/arkynConstants";
import { generateShopSigils } from "../../shared/shopGeneration";
import { SIGIL_DEFINITIONS } from "../../shared/sigils";
import { Logger } from "@core/shared/utils";
import { clearArraySchema } from "../utils/clearArraySchema";

const logger = new Logger("ArkynRerollShop");

/**
 * Reroll the sigil slots of the shop. Costs REROLL_COST gold. Only the
 * sigil items are regenerated — scrolls and rune bags keep their existing
 * state (including `purchased`) so the player doesn't lose progress on
 * the consumables they've already decided to skip or buy.
 *
 * The new sigil roll uses `shopRerollCount` as an RNG jitter so repeat
 * rerolls within the same shop visit yield distinct offerings, and each
 * Nth reroll is deterministic per (runSeed, round, N).
 */
export function handleRerollShop(
    state: ArkynState,
    client: { sessionId: string },
): void {
    if (state.gamePhase !== "shop") {
        logger.warn(`Reroll rejected: game phase is ${state.gamePhase}`);
        return;
    }

    const player = state.players.get(client.sessionId);
    if (!player) {
        logger.warn(`Reroll rejected: player ${client.sessionId} not found`);
        return;
    }

    if (player.gold < REROLL_COST) {
        logger.warn(`Reroll rejected: insufficient gold (${player.gold} < ${REROLL_COST})`);
        return;
    }

    // Snapshot the non-sigil items so we can re-append them after rebuilding
    // the sigil section. Preserves their existing `purchased` flag.
    const preservedItems: { itemType: string; element: string; cost: number; purchased: boolean }[] = [];
    for (let i = 0; i < player.shopItems.length; i++) {
        const it = player.shopItems[i];
        if (it.itemType !== "sigil") {
            preservedItems.push({
                itemType: it.itemType,
                element: it.element,
                cost: it.cost,
                purchased: it.purchased,
            });
        }
    }

    player.shopRerollCount++;
    player.gold -= REROLL_COST;

    const ownedSigils = Array.from(player.sigils);
    const sigilIds = generateShopSigils(
        state.runSeed,
        state.currentRound + 1,
        ownedSigils,
        player.shopRerollCount,
    );

    // Rebuild shopItems: new sigils first (matching the layout handleReady
    // produces on shop entry), then the preserved consumables.
    clearArraySchema(player.shopItems);

    for (const sigilId of sigilIds) {
        const def = SIGIL_DEFINITIONS[sigilId];
        if (!def) continue;
        const item = new ShopItemState();
        item.itemType = "sigil";
        item.element = sigilId;
        item.cost = def.cost;
        item.purchased = false;
        player.shopItems.push(item);
    }

    for (const preserved of preservedItems) {
        const item = new ShopItemState();
        item.itemType = preserved.itemType;
        item.element = preserved.element;
        item.cost = preserved.cost;
        item.purchased = preserved.purchased;
        player.shopItems.push(item);
    }

    logger.info(
        `Player ${client.sessionId} rerolled shop (#${player.shopRerollCount}). `
        + `Sigils: [${sigilIds.join(", ")}]. Gold remaining: ${player.gold}`,
    );
}
