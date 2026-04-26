import {
    type ArkynPlayerState,
    type ArkynState,
    type ShopItemState,
} from "../../shared";
import { MAX_SIGILS } from "../../shared/arkynConstants";
import { rollBagRunes } from "../utils/rollBagRunes";
import { rollCodexScrolls } from "../utils/rollCodexScrolls";
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

// One picker can be open at a time across all pack types. The picker UI
// is mutually exclusive (the shop's center column shows ONE picker), so
// rejecting a second pack while another is open keeps server state in
// sync with the only picker the client can render.
function anyPackPickerOpen(player: ArkynPlayerState): boolean {
    return player.pendingBagRunes.length > 0 || player.pendingCodexScrolls.length > 0;
}

function handleRuneBagPurchase({ player, sessionId }: ShopPurchaseCtx): ShopPurchaseResult {
    if (anyPackPickerOpen(player)) {
        return { ok: false, reason: "a pack picker is already open" };
    }

    // `currentRound + 1` matches the shop's "next round" seeding
    // convention used by generateShopPacks / generateShopSigils.
    // `bagPurchaseCount` keeps incrementing across multiple purchases
    // in the same shop so the 2nd / 3rd bag rolls fresh runes.
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

function handleCodexPackPurchase({ player, sessionId }: ShopPurchaseCtx): ShopPurchaseResult {
    if (anyPackPickerOpen(player)) {
        return { ok: false, reason: "a pack picker is already open" };
    }

    const elements = rollCodexScrolls(
        player.runSeed,
        player.currentRound + 1,
        player.codexPurchaseCount,
    );
    for (const el of elements) {
        player.pendingCodexScrolls.push(el);
    }
    player.codexPurchaseCount++;

    return {
        ok: true,
        logMessage:
            `Player ${sessionId} bought a Codex Pack. Rolls: [${elements.join(", ")}].`,
    };
}

export const SHOP_ITEM_HANDLERS: Record<string, ShopItemHandler> = {
    sigil: handleSigilPurchase,
    runeBag: handleRuneBagPurchase,
    codexPack: handleCodexPackPurchase,
};
