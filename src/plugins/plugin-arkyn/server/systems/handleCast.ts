import {
    type ArkynState,
    applyAccumulatorIncrements,
    getEndOfRoundSigilGold,
} from "../../shared";
import { resolveSpell } from "../../shared/resolveSpell";
import { Logger } from "@core/shared/utils";
import { calculateDamage } from "../utils/calculateDamage";
import { refillHand } from "../utils/refillHand";
import { removeRunesFromHand, validateRuneSelection } from "./utils/runeSelection";
import type { ArkynContext } from "../types/ArkynContext";
import { getRunStats } from "../resources/runStats";
import { syncRunStatsToSchema } from "../utils/syncRunStatsToSchema";
import { finalizeRun } from "../utils/finalizeRun";

const logger = new Logger("ArkynCast");

// Base gold awarded for defeating an enemy. Bonus gold is added on top
// equal to the player's remaining hands (cast budget) at the moment of
// the killing blow.
const GOLD_BASE_REWARD = 3;

export function handleCast(
    state: ArkynState,
    client: { sessionId: string },
    payload: unknown,
    ctx: ArkynContext,
): void {
    const result = validateRuneSelection(state, client, payload, {
        logger,
        action: "Cast",
        budgetField: "castsRemaining",
    });
    if (!result) return;
    const { player, indices } = result;

    // Extract selected runes (by index)
    const selectedRunes = indices.map(i => player.hand[i]);

    // Resolve spell — pass active sigils so sigil-gated synergies (e.g.
    // Burnrite's Fire+Death) fire when the player owns the relevant sigil.
    const activeSigils = Array.from(player.sigils);
    const spell = resolveSpell(
        selectedRunes.map(r => ({ element: r.element })),
        activeSigils,
    );
    if (!spell) {
        logger.warn(`Cast rejected: could not resolve spell`);
        return;
    }

    // Calculate damage — each contributing rune is evaluated against the
    // enemy's resistances/weaknesses individually, then summed. Sigil effects
    // (Voltage procs, Synapse hand-mult, etc.) are applied inside
    // calculateDamage using the sigil effect registries. Proc gold (from
    // Fortune-style grant_gold effects) is returned alongside the damage
    // and applied to player.gold below in the same state patch.
    const { finalDamage: damage, procGold, criticalCount } = calculateDamage(
        spell,
        selectedRunes,
        state.enemy,
        player.scrollLevels,
        player.sigils,
        state.runSeed,
        state.currentRound,
        player.castsRemaining,
        player.hand,
        indices,
        player.disabledResistance,
        player.sigilAccumulators,
    );

    // Move selected runes to played area
    while (player.playedRunes.length > 0) player.playedRunes.pop();
    for (const rune of selectedRunes) {
        player.playedRunes.push(rune);
    }

    // Remove played runes from hand
    removeRunesFromHand(player, indices);

    // Apply damage
    state.enemy.currentHp = Math.max(0, state.enemy.currentHp - damage);

    // Update player state
    player.lastSpellName = spell.spellName;
    player.lastSpellTier = spell.tier;
    player.lastDamage = damage;
    player.castsRemaining--;

    // Accumulate run stats
    const stats = getRunStats(client.sessionId);
    if (stats) {
        stats.totalCasts++;
        stats.totalDamage += damage;
        stats.highestSingleCastDamage = Math.max(stats.highestSingleCastDamage, damage);
        stats.spellUsage[spell.spellName] = (stats.spellUsage[spell.spellName] ?? 0) + 1;
    }

    // Credit Fortune-style proc gold. The client mirrors the same proc roll
    // and shows "+N Gold" bubbles over the procced runes during the cast
    // animation; this schema patch carries the authoritative total.
    if (procGold > 0) {
        player.gold += procGold;
        if (stats) stats.goldEarned += procGold;
    }

    // Patch accumulator-driven sigils (Executioner et al.) based on the
    // events this cast produced. Post-cast increment means the CURRENT
    // cast used the pre-cast accumulator value as xMult; future casts
    // read the updated value via schema sync.
    if (criticalCount > 0) {
        const accumulatorsPlain: Record<string, number> = {};
        player.sigilAccumulators.forEach((value, key) => { accumulatorsPlain[key] = value; });
        const updates = applyAccumulatorIncrements(
            Array.from(player.sigils),
            accumulatorsPlain,
            { criticalHit: criticalCount },
        );
        for (const sigilId of Object.keys(updates)) {
            player.sigilAccumulators.set(sigilId, updates[sigilId]);
        }
    }

    logger.info(`${spell.spellName} (Tier ${spell.tier}) deals ${damage} damage! Enemy HP: ${state.enemy.currentHp}/${state.enemy.maxHp}`);

    // Check if enemy is defeated
    if (state.enemy.currentHp <= 0) {
        // Stage the gold breakdown onto the player so the Round End
        // overlay can display it:
        //  - 3 base for the kill
        //  - +1 per remaining cast ("hand") the player still has banked.
        //    `castsRemaining` was decremented above for the killing-blow
        //    cast itself, so a 1-cast clear yields a 2-hand bonus, etc.
        //
        // NOTE: the gold is NOT added to `player.gold` here — the award
        // is deferred until the player clicks Continue on the RoundEnd
        // overlay (handled in `handleReady`). This keeps the Spell
        // Preview gold counter from ticking up before the overlay even
        // appears, and makes the "Continue → gold added" moment read as
        // a deliberate player action rather than a silent schema patch.
        const baseGold = GOLD_BASE_REWARD;
        const handsCount = player.castsRemaining;
        const handsBonus = handsCount;
        // Sigil bonus: flat gold from end-of-round-gold sigils (Plunder et al.).
        // Iterates SIGIL_END_OF_ROUND_GOLD generically — zero sigil-specific
        // branching, so adding future "+N gold per round" sigils is a data
        // entry. The client derives per-sigil rows from the same registry.
        const sigilBonus = getEndOfRoundSigilGold(Array.from(player.sigils)).total;
        player.lastRoundGoldBase = baseGold;
        player.lastRoundGoldHandsBonus = handsBonus;
        player.lastRoundGoldHandsCount = handsCount;
        player.lastRoundGoldSigilBonus = sigilBonus;
        // Reset the collected flag — the client will flip it true when it
        // fires ARKYN_COLLECT_ROUND_GOLD at the overlay's Total reveal.
        player.lastRoundGoldCollected = false;

        if (stats) {
            stats.enemiesDefeated++;
            // stats.goldEarned for the round-win reward is also deferred
            // to handleReady so the stat accumulates at the same moment
            // the player's gold does.
        }

        state.gamePhase = "round_end";
        logger.info(
            `Enemy defeated! Round ${state.currentRound} complete. ` +
            `Pending gold: ${baseGold} base + ${handsBonus} hands bonus ` +
            `+ ${sigilBonus} sigil bonus ` +
            `= ${baseGold + handsBonus + sigilBonus} (awarded on Continue)`,
        );
        return;
    }

    // If the player has exhausted all casts without killing the enemy,
    // the run is over — discards can't deal damage so there's no way
    // to finish the fight. Skip the refill so the client doesn't see
    // new runes drawn right before the game-over screen.
    if (player.castsRemaining <= 0) {
        // Sync final run stats to schema before setting game_over so the
        // client receives both in the same Colyseus state patch.
        if (stats) syncRunStatsToSchema(player, stats);
        finalizeRun(client.sessionId, ctx, state.currentRound);

        state.gamePhase = "game_over";
        logger.info(`Game over! Player ${client.sessionId} ran out of casts on round ${state.currentRound}.`);
        return;
    }

    // Draw back to hand size (only when the player still has casts left).
    refillHand(player, client.sessionId);
}
