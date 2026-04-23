import {
    HAND_SIZE,
    CASTS_PER_ROUND,
    DISCARDS_PER_ROUND,
    MAX_CONSUMABLES,
    expandMimicSigilsDetailed,
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
 * @param enemyCtx  Freshly-spawned enemy's affinities, passed to lifecycle
 *   hooks that need them (Binoculars picks one of `enemyResistances`).
 *   Empty arrays are safe — Binoculars no-ops when the enemy has no
 *   resistances, which also covers the handleJoin/handleNewRun first call
 *   where the player has zero sigils anyway.
 */
export function initPlayerForRound(
    player: ArkynPlayerState,
    sessionId: string,
    round = 0,
    runSeed = 0,
    enemyCtx: {
        readonly enemyResistances: readonly string[];
        readonly enemyWeaknesses: readonly string[];
    } = { enemyResistances: [], enemyWeaknesses: [] },
): void {
    clearArraySchema(player.hand);
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
    // Clear any previous round's dynamic resist-ignore pick. Binoculars
    // reassigns it below; otherwise stays empty so the enemy's full
    // resistance set applies normally.
    player.disabledResistance = "";
    // Same for Ahoy's per-round discard-gold element — lifecycle hook
    // rerolls below if Ahoy is owned, otherwise stays empty so the
    // discard hook is a no-op.
    player.ahoyDiscardElement = "";
    // Reset the per-round discard counter so discard-hook sigils (Banish)
    // see `discardNumber: 1` on the first discard of the new round.
    player.discardsUsedThisRound = 0;
    // Same for cast-hook sigils (Magic Mirror) — the counter tracks how
    // many casts have fired so the hook's `castNumber` can gate on "first
    // cast of round" without re-computing from effective-casts deltas.
    player.castsUsedThisRound = 0;

    // Fire lifecycle hooks — each hook returns zero or more discriminated
    // effects we dispatch over. New effect kinds (grantGold, grantStat, …)
    // slot into the switch without touching the hooks themselves.
    //
    // `expandMimicSigilsDetailed` injects a neighbor-copy entry for each
    // Mimic sigil whose right neighbor is Mimic-compatible. The entry's
    // `copyIndex` feeds into the hook ctx so seeded-RNG hooks (Thief)
    // roll a different result for the copy than for the original.
    for (const entry of expandMimicSigilsDetailed(Array.from(player.sigils))) {
        const hooks = SIGIL_LIFECYCLE_HOOKS[entry.sigilId];
        if (!hooks?.onRoundStart) continue;
        const effects = hooks.onRoundStart(round, runSeed, {
            enemyResistances: enemyCtx.enemyResistances,
            enemyWeaknesses: enemyCtx.enemyWeaknesses,
            copyIndex: entry.copyIndex,
        });
        if (!effects) continue;
        for (const effect of effects) {
            switch (effect.type) {
                case "grantConsumable":
                    if (player.consumables.length < MAX_CONSUMABLES) {
                        player.consumables.push(effect.consumableId);
                    }
                    break;
                case "grantGold":
                    player.gold += effect.amount;
                    break;
                case "grantStat":
                    player[effect.stat] += effect.amount;
                    break;
                case "disableResistance":
                    player.disabledResistance = effect.element;
                    break;
                case "setAhoyElement":
                    player.ahoyDiscardElement = effect.element;
                    break;
            }
        }
    }

    // Belt-and-suspenders: a player should never cross a round boundary
    // with an open Rune Bag picker (handleReady leaves shop -> playing
    // only after player confirmation, and the client disables Next Round
    // while a picker is open). But if it ever happened, drop the
    // in-flight runes so the picker doesn't linger into the next round.
    clearArraySchema(player.pendingBagRunes);

    const acquired = Array.from(player.acquiredRunes).map(r => ({
        id: r.id,
        element: r.element,
        rarity: r.rarity,
        level: r.level,
    }));
    const banished = Array.from(player.banishedRunes).map(r => ({
        id: r.id,
        element: r.element,
        rarity: r.rarity,
        level: r.level,
    }));
    setPouch(sessionId, createPouch(acquired, banished));
    refillHand(player, sessionId);
}
