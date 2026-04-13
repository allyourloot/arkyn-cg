import { type ArkynState } from "../../shared";
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
    // calculateDamage using the sigil effect registries.
    const damage = calculateDamage(
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

    logger.info(`${spell.spellName} (Tier ${spell.tier}) deals ${damage} damage! Enemy HP: ${state.enemy.currentHp}/${state.enemy.maxHp}`);

    // Check if enemy is defeated
    if (state.enemy.currentHp <= 0) {
        // Award gold:
        //  - 3 base for the kill
        //  - +1 per remaining cast ("hand") the player still has banked.
        //    `castsRemaining` was decremented above for the killing-blow
        //    cast itself, so a 1-cast clear yields a 2-hand bonus, etc.
        const baseGold = GOLD_BASE_REWARD;
        const handsCount = player.castsRemaining;
        const handsBonus = handsCount;
        player.lastRoundGoldBase = baseGold;
        player.lastRoundGoldHandsBonus = handsBonus;
        player.lastRoundGoldHandsCount = handsCount;
        player.gold += baseGold + handsBonus;

        if (stats) {
            stats.enemiesDefeated++;
            stats.goldEarned += baseGold + handsBonus;
        }

        state.gamePhase = "round_end";
        logger.info(
            `Enemy defeated! Round ${state.currentRound} complete. ` +
            `Gold awarded: ${baseGold} base + ${handsBonus} hands bonus ` +
            `= ${baseGold + handsBonus} (total: ${player.gold})`,
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
