import { HAND_SIZE, type ArkynPlayerState } from "../../shared";
import { drawRunes, syncPlayerPouch } from "./drawRunes";
import { getPouch } from "../resources/playerPouch";

/**
 * Top up `player.hand` from the player's pouch until it reaches HAND_SIZE,
 * then keep `player.pouchSize` and the synced pouch mirror in sync.
 *
 * No-ops if the pouch is unset or the hand is already full.
 *
 * Used after cast / discard / round-start so every handler shares the same
 * "draw back to full" semantics.
 */
export function refillHand(player: ArkynPlayerState, sessionId: string): void {
    const pouch = getPouch(sessionId);
    if (!pouch || player.hand.length >= HAND_SIZE) return;

    const toDraw = HAND_SIZE - player.hand.length;
    const drawn = drawRunes(pouch, toDraw);
    for (const rune of drawn) {
        player.hand.push(rune);
    }
    player.pouchSize = pouch.length;
    syncPlayerPouch(player, pouch);
}
