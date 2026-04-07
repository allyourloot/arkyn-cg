import type { SimpleHotbarState } from "../../shared";
import { getOrCreatePlayerState } from "../resources/hotbarPlayers";
import { parseSlotPayload } from "../utils/parseSlotPayload";

export function selectHotbarSlot(state: SimpleHotbarState, client: { sessionId: string }, payload: unknown) {
    const parsed = parseSlotPayload(payload);
    if (!parsed) return;

    const playerState = getOrCreatePlayerState(state, client.sessionId);
    playerState.selectedSlot = parsed.slot;
}
