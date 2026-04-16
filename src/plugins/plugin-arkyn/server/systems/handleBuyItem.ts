import { RuneInstance, type ArkynState } from "../../shared";
import { MAX_SIGILS, MAX_RUNE_BAGS_PER_SHOP } from "../../shared/arkynConstants";
import { Logger } from "@core/shared/utils";
import { rollBagRunes } from "../utils/rollBagRunes";

const logger = new Logger("ArkynBuyItem");

export function handleBuyItem(
    state: ArkynState,
    client: { sessionId: string },
    payload: unknown,
): void {
    if (state.gamePhase !== "shop") {
        logger.warn(`Buy rejected: game phase is ${state.gamePhase}`);
        return;
    }

    const player = state.players.get(client.sessionId);
    if (!player) {
        logger.warn(`Buy rejected: player ${client.sessionId} not found`);
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
        logger.warn(
            `Buy rejected: insufficient gold (${player.gold} < ${item.cost})`,
        );
        return;
    }

    // Deduct gold and mark purchased
    player.gold -= item.cost;
    item.purchased = true;

    if (item.itemType === "scroll") {
        const currentLevel = player.scrollLevels.get(item.element) ?? 0;
        player.scrollLevels.set(item.element, currentLevel + 1);
        logger.info(
            `Player ${client.sessionId} bought ${item.element} scroll ` +
            `(level ${currentLevel + 1}). Gold remaining: ${player.gold}`,
        );
    } else if (item.itemType === "sigil") {
        if (player.sigils.length >= MAX_SIGILS) {
            logger.warn(`Buy rejected: sigil slots full (${MAX_SIGILS})`);
            // Refund — the gold was already deducted above
            player.gold += item.cost;
            item.purchased = false;
            return;
        }
        if (Array.from(player.sigils).includes(item.element)) {
            logger.warn(`Buy rejected: player already owns sigil "${item.element}"`);
            player.gold += item.cost;
            item.purchased = false;
            return;
        }
        player.sigils.push(item.element);
        logger.info(
            `Player ${client.sessionId} bought sigil "${item.element}". ` +
            `Gold remaining: ${player.gold}`,
        );
    } else if (item.itemType === "runeBag") {
        // Reject double-buy while a picker is already open — avoids
        // dropping the first bag's rolls on the floor. Also reject if
        // the per-shop cap is already hit.
        if (player.pendingBagRunes.length > 0) {
            logger.warn("Buy rejected: a Rune Bag picker is already open");
            player.gold += item.cost;
            item.purchased = false;
            return;
        }
        if (player.bagPurchaseCount >= MAX_RUNE_BAGS_PER_SHOP) {
            logger.warn(`Buy rejected: per-shop Rune Bag cap reached (${MAX_RUNE_BAGS_PER_SHOP})`);
            player.gold += item.cost;
            item.purchased = false;
            return;
        }

        // `currentRound + 1` matches the shop's "next round" seeding
        // convention used by generateShopScrolls / generateShopSigils.
        const rolls = rollBagRunes(
            state.runSeed,
            state.currentRound + 1,
            player.bagPurchaseCount,
        );
        for (const r of rolls) {
            const ri = new RuneInstance();
            ri.id = r.id;
            ri.element = r.element;
            ri.rarity = r.rarity;
            ri.level = r.level;
            player.pendingBagRunes.push(ri);
        }
        player.bagPurchaseCount++;

        logger.info(
            `Player ${client.sessionId} bought a Rune Bag. Rolls: ` +
            `[${rolls.map(r => `${r.rarity} ${r.element}`).join(", ")}]. ` +
            `Gold remaining: ${player.gold}`,
        );
    }
}
