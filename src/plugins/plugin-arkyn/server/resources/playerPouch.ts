import type { RuneInstanceData } from "../utils/createPouch";

/** Server-only storage for each player's undrawn rune pouch */
const playerPouches = new Map<string, RuneInstanceData[]>();

export function getPouch(sessionId: string): RuneInstanceData[] | undefined {
    return playerPouches.get(sessionId);
}

export function setPouch(sessionId: string, pouch: RuneInstanceData[]): void {
    playerPouches.set(sessionId, pouch);
}

export function removePouch(sessionId: string): void {
    playerPouches.delete(sessionId);
}
