import {
    getScrollLevelsPerUse,
    type ArkynPlayerState,
    type ArkynState,
    type ShopItemState,
} from "../../shared";
import { MAX_RUNE_BAGS_PER_SHOP, MAX_SIGILS } from "../../shared/arkynConstants";
import { rollBagRunes } from "../utils/rollBagRunes";
import { createRuneInstance } from "../utils/drawRunes";

export interface ShopPurchaseCtx {
    state: ArkynState;
    player: ArkynPlayerState;
    item: ShopItemState;
    sessionId: string;
}

export type ShopPurchaseResult =
    | { ok: true; logMessage: string }
    | { ok: false; reason: string };

export type ShopItemHandler = (ctx: ShopPurchaseCtx) => ShopPurchaseResult;

// Handlers validate their type-specific preconditions and apply the state
// mutation on success. They do NOT charge gold or set `item.purchased` —
// the dispatcher (`handleBuyItem`) owns that commit step so the refund
// path lives in exactly one place (there is no refund — we only commit
// after the handler succeeds).
function handleScrollPurchase({ player, item, sessionId }: ShopPurchaseCtx): ShopPurchaseResult {
    const currentLevel = player.scrollLevels.get(item.element) ?? 0;
    const levelsGained = getScrollLevelsPerUse(Array.from(player.sigils));
    const newLevel = currentLevel + levelsGained;
    player.scrollLevels.set(item.element, newLevel);
    return {
        ok: true,
        logMessage:
            `Player ${sessionId} bought ${item.element} scroll ` +
            `(level ${newLevel}${levelsGained > 1 ? `, +${levelsGained}` : ""}).`,
    };
}

function handleSigilPurchase({ player, item, sessionId }: ShopPurchaseCtx): ShopPurchaseResult {
    if (player.sigils.length >= MAX_SIGILS) {
        return { ok: false, reason: `sigil slots full (${MAX_SIGILS})` };
    }
    if (Array.from(player.sigils).includes(item.element)) {
        return { ok: false, reason: `player already owns sigil "${item.element}"` };
    }
    player.sigils.push(item.element);
    return {
        ok: true,
        logMessage: `Player ${sessionId} bought sigil "${item.element}".`,
    };
}

function handleRuneBagPurchase({ player, sessionId }: ShopPurchaseCtx): ShopPurchaseResult {
    // Reject double-buy while a picker is already open — avoids dropping
    // the first bag's rolls on the floor. Also reject if the per-shop cap
    // is already hit.
    if (player.pendingBagRunes.length > 0) {
        return { ok: false, reason: "a Rune Bag picker is already open" };
    }
    if (player.bagPurchaseCount >= MAX_RUNE_BAGS_PER_SHOP) {
        return {
            ok: false,
            reason: `per-shop Rune Bag cap reached (${MAX_RUNE_BAGS_PER_SHOP})`,
        };
    }

    // `currentRound + 1` matches the shop's "next round" seeding
    // convention used by generateShopScrolls / generateShopSigils.
    const rolls = rollBagRunes(
        player.runSeed,
        player.currentRound + 1,
        player.bagPurchaseCount,
    );
    for (const r of rolls) {
        player.pendingBagRunes.push(createRuneInstance(r));
    }
    player.bagPurchaseCount++;

    return {
        ok: true,
        logMessage:
            `Player ${sessionId} bought a Rune Bag. Rolls: ` +
            `[${rolls.map(r => `${r.rarity} ${r.element}`).join(", ")}].`,
    };
}

export const SHOP_ITEM_HANDLERS: Record<string, ShopItemHandler> = {
    scroll: handleScrollPurchase,
    sigil: handleSigilPurchase,
    runeBag: handleRuneBagPurchase,
};
