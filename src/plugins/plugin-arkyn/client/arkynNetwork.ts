import { ARKYN_JOIN, ARKYN_READY, ARKYN_COLLECT_ROUND_GOLD, ARKYN_NEW_RUN, ARKYN_BUY_ITEM, ARKYN_SELL_SIGIL, ARKYN_REORDER_SIGILS, ARKYN_USE_CONSUMABLE, ARKYN_PICK_PACK_RUNE, ARKYN_PICK_CODEX_SCROLL, ARKYN_APPLY_TAROT, ARKYN_REROLL_SHOP, ARKYN_DEBUG_GRANT_SIGIL } from "../shared";

/**
 * Network layer for Arkyn. Owns the connection sender and exposes
 * fire-and-forget message helpers used by both UI components and the
 * animation orchestrator.
 */

let sendFn: ((type: string, data: unknown) => void) | null = null;

export function setConnection(send: (type: string, data: unknown) => void): void {
    sendFn = send;
}

/**
 * Send a message to the server. Silently no-ops before the connection has
 * been wired up — callers don't need to null-check.
 */
export function sendArkynMessage(type: string, data: unknown): void {
    sendFn?.(type, data);
}

export function joinGame(): void {
    sendArkynMessage(ARKYN_JOIN, {});
}

export function sendReady(): void {
    sendArkynMessage(ARKYN_READY, {});
}

/**
 * Tell the server to credit the staged round-win gold into the player's
 * bank. Fired by the RoundEnd overlay at the moment its "Total" line
 * reveals so the counter ticks up with the stinger rather than waiting
 * for the Continue click.
 */
export function sendCollectRoundGold(): void {
    sendArkynMessage(ARKYN_COLLECT_ROUND_GOLD, {});
}

export function sendNewRun(): void {
    sendArkynMessage(ARKYN_NEW_RUN, {});
}

export function sendBuyItem(shopIndex: number): void {
    sendArkynMessage(ARKYN_BUY_ITEM, { shopIndex });
}

export function sendSellSigil(sigilId: string): void {
    sendArkynMessage(ARKYN_SELL_SIGIL, { sigilId });
}

/**
 * Reorder a sigil in the player's sigil bar from `fromIndex` to `toIndex`.
 * Fired by the drag-to-reorder interaction. The server is authoritative —
 * we do NOT optimistically mutate the local sigils array; when the server
 * echoes the new ArraySchema state, the usual Colyseus sync path updates
 * the UI. Roundtrip is effectively zero for local play.
 */
export function sendReorderSigils(fromIndex: number, toIndex: number): void {
    sendArkynMessage(ARKYN_REORDER_SIGILS, { fromIndex, toIndex });
}

export function sendUseConsumable(index: number): void {
    sendArkynMessage(ARKYN_USE_CONSUMABLE, { index });
}

// `index = null` means Skip. `index = number` means Select that rune.
export function sendPackChoice(index: number | null): void {
    sendArkynMessage(ARKYN_PICK_PACK_RUNE, { index });
}

// `index = null` means Skip. `index = number` means Select that scroll.
export function sendCodexChoice(index: number | null): void {
    sendArkynMessage(ARKYN_PICK_CODEX_SCROLL, { index });
}

/**
 * Apply a tarot from the Augury Pack picker. `tarotId = null` means
 * Skip (no effect, no refund). Otherwise the server validates the
 * tarot id is in `pendingAuguryTarots`, the indices are in bounds,
 * the count matches the tarot's min/max, and the optional element
 * pick is valid.
 */
export function sendApplyTarot(args: {
    tarotId: string | null;
    runeIndices?: number[];
    element?: string | null;
}): void {
    if (args.tarotId === null) {
        sendArkynMessage(ARKYN_APPLY_TAROT, { tarotId: null });
        return;
    }
    sendArkynMessage(ARKYN_APPLY_TAROT, {
        tarotId: args.tarotId,
        runeIndices: args.runeIndices ?? [],
        element: args.element ?? undefined,
    });
}

/**
 * Reroll the shop's sigil slots. Deducts REROLL_COST gold server-side
 * and regenerates the sigil offerings. Scrolls + rune packs stay put.
 */
export function sendRerollShop(): void {
    sendArkynMessage(ARKYN_REROLL_SHOP, {});
}

/**
 * Dev-only — grant a sigil directly. No gold cost, bypasses the shop.
 * Exposed on the browser `window.arkyn.grantSigil(id)` console helper
 * via `debugCommands.ts`; avoid calling from production UI code.
 */
export function sendDebugGrantSigil(sigilId: string): void {
    sendArkynMessage(ARKYN_DEBUG_GRANT_SIGIL, { sigilId });
}
