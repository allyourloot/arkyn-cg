import { type ArkynState } from "../../shared";
import { resolveSpell } from "../../shared/resolveSpell";
import { Logger } from "@core/shared/utils";
import { calculateDamage } from "../utils/calculateDamage";
import { refillHand } from "../utils/refillHand";
import { removeRunesFromHand, validateRuneSelection } from "./utils/runeSelection";

const logger = new Logger("ArkynCast");

// Base gold awarded for defeating an enemy. Bonus gold is added on top
// equal to the player's remaining hands (cast budget) at the moment of
// the killing blow.
const GOLD_BASE_REWARD = 3;

export function handleCast(
    state: ArkynState,
    client: { sessionId: string },
    payload: unknown,
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

    // Resolve spell
    const spell = resolveSpell(selectedRunes.map(r => ({ element: r.element })));
    if (!spell) {
        logger.warn(`Cast rejected: could not resolve spell`);
        return;
    }

    // Calculate damage — each contributing rune is evaluated against the
    // enemy's resistances/weaknesses individually, then summed.
    const damage = calculateDamage(spell, selectedRunes, state.enemy);

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

        state.gamePhase = "round_end";
        logger.info(
            `Enemy defeated! Round ${state.currentRound} complete. ` +
            `Gold awarded: ${baseGold} base + ${handsBonus} hands bonus ` +
            `= ${baseGold + handsBonus} (total: ${player.gold})`,
        );
        return;
    }

    // Draw back to hand size
    refillHand(player, client.sessionId);

    // If the player has exhausted all casts without killing the enemy,
    // the run is over — discards can't deal damage so there's no way
    // to finish the fight.
    if (player.castsRemaining <= 0) {
        state.gamePhase = "game_over";
        logger.info(`Game over! Player ${client.sessionId} ran out of casts on round ${state.currentRound}.`);
    }
}
