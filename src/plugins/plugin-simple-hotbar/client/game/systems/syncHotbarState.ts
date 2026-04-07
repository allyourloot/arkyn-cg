import type { SimpleHotbarState } from "../../../shared";
import { EMPTY_HOTBAR_SLOT_VALUE, HOTBAR_SIZE } from "../../../shared";
import { setHotbarSlots, setSelectedSlot } from "../../hotbarStore";

export function createSyncHotbarStateSystem(state: SimpleHotbarState, sessionId: string) {
    const slotsSnapshot = Array.from({ length: HOTBAR_SIZE }, () => EMPTY_HOTBAR_SLOT_VALUE);
    let selectedSnapshot = 0;

    return () => {
        const playerState = state.players.get(sessionId);
        if (!playerState) return;

        let slotsChanged = false;
        for (let i = 0; i < HOTBAR_SIZE; i++) {
            const value = playerState.slots[i] ?? EMPTY_HOTBAR_SLOT_VALUE;
            if (slotsSnapshot[i] !== value) {
                slotsSnapshot[i] = value;
                slotsChanged = true;
            }
        }
        if (slotsChanged) {
            setHotbarSlots([...slotsSnapshot]);
        }

        const nextSelected = Number.isInteger(playerState.selectedSlot)
            ? playerState.selectedSlot
            : 0;
        if (nextSelected !== selectedSnapshot) {
            selectedSnapshot = nextSelected;
            setSelectedSlot(selectedSnapshot);
        }
    };
}
