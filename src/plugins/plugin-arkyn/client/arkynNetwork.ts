import { ARKYN_JOIN, ARKYN_READY, ARKYN_NEW_RUN, ARKYN_BUY_ITEM, ARKYN_SELL_SIGIL } from "../shared";

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

export function sendNewRun(): void {
    sendArkynMessage(ARKYN_NEW_RUN, {});
}

export function sendBuyItem(shopIndex: number): void {
    sendArkynMessage(ARKYN_BUY_ITEM, { shopIndex });
}

export function sendSellSigil(sigilId: string): void {
    sendArkynMessage(ARKYN_SELL_SIGIL, { sigilId });
}
