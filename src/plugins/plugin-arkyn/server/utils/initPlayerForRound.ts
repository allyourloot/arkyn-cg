import {
    HAND_SIZE,
    CASTS_PER_ROUND,
    DISCARDS_PER_ROUND,
    MAX_CONSUMABLES,
    getPlayerStatDeltas,
    SIGIL_LIFECYCLE_HOOKS,
    type ArkynPlayerState,
} from "../../shared";
import { clearArraySchema } from "./clearArraySchema";
import { createPouch } from "./createPouch";
import { setPouch } from "../resources/playerPouch";
import { refillHand } from "./refillHand";

/**
 * Reset a player to their fresh-round state: clear hand and played runes,
 * reset spell metadata, restore the action budgets, drop a fresh pouch in
 * the resource map, and draw a full hand from it.
 *
 * Used by both `handleJoin` (first round) and `handleReady` (subsequent
 * rounds) so the "what does a player look like at the start of a round"
 * definition lives in exactly one place. Safe to call on a brand-new
 * `ArkynPlayerState` — the clears and metadata resets are no-ops on a
 * Schema with default values.
 *
 * @param round  Current round number (1-based). Used by lifecycle hooks.
 * @param runSeed  Run seed for deterministic RNG in lifecycle hooks.
 */
export function initPlayerForRound(
    player: ArkynPlayerState,
    sessionId: string,
    round = 0,
    runSeed = 0,
): void {
    clearArraySchema(player.hand);
    clearArraySchema(player.playedRunes);
    player.lastSpellName = "";
    player.lastSpellTier = 0;
    player.lastDamage = 0;
    // Apply stat deltas from all owned sigils (Caster +1 cast, future
    // +1 discard / +1 hand size / etc.). Additive across sigils.
    const statDeltas = getPlayerStatDeltas(Array.from(player.sigils));
    player.handSize = HAND_SIZE + statDeltas.handSize;
    player.castsRemaining = CASTS_PER_ROUND + statDeltas.castsPerRound;
    player.discardsRemaining = DISCARDS_PER_ROUND + statDeltas.discardsPerRound;
    // Clear the previous round's reward breakdown so the round-end overlay
    // never shows stale numbers if the next defeat happens before the
    // server has had a chance to set them. `gold` (the running total) is
    // intentionally NOT reset — it persists across rounds.
    player.lastRoundGoldBase = 0;
    player.lastRoundGoldHandsBonus = 0;
    player.lastRoundGoldHandsCount = 0;

    // Fire lifecycle hooks (Thief grants a random scroll consumable).
    for (const sigilId of player.sigils) {
        const hooks = SIGIL_LIFECYCLE_HOOKS[sigilId];
        if (!hooks?.onRoundStart) continue;
        const result = hooks.onRoundStart(round, runSeed);
        if (result?.grantConsumable && player.consumables.length < MAX_CONSUMABLES) {
            player.consumables.push(result.grantConsumable);
        }
    }

    setPouch(sessionId, createPouch());
    refillHand(player, sessionId);
}
