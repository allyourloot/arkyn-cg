import { ARKYN_JOIN, ARKYN_READY, ARKYN_COLLECT_ROUND_GOLD, ARKYN_NEW_RUN, ARKYN_BUY_ITEM, ARKYN_SELL_SIGIL, ARKYN_USE_CONSUMABLE } from "../shared";

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

export function sendUseConsumable(index: number): void {
    sendArkynMessage(ARKYN_USE_CONSUMABLE, { index });
}
