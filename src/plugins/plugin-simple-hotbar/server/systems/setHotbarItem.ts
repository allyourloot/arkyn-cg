import { HOTBAR_SIZE, type SimpleHotbarState } from "../../shared";
import { getOrCreatePlayerState } from "../resources/hotbarPlayers";

export function setHotbarItem(state: SimpleHotbarState, client: { sessionId: string }, payload: unknown) {
    const parsed = payload !== null && typeof payload === "object"
        ? payload as { slot?: unknown; blockId?: unknown }
        : null;
    const slot = Number(parsed?.slot);
    const blockId = Number(parsed?.blockId);
    if (!Number.isInteger(slot) || slot < 0 || slot >= HOTBAR_SIZE) return;
    if (!Number.isInteger(blockId) || blockId < 0) return;

    const playerState = getOrCreatePlayerState(state, client.sessionId);
    playerState.slots[slot] = blockId;
}
