import { type ArkynState } from "../../shared";
import { resolveSpell } from "../../shared/resolveSpell";
import { Logger } from "@core/shared/utils";
import { calculateDamage } from "../utils/calculateDamage";
import { refillHand } from "../utils/refillHand";
import { removeRunesFromHand, validateRuneSelection } from "./utils/runeSelection";

const logger = new Logger("ArkynCast");

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
        state.gamePhase = "round_end";
        logger.info(`Enemy defeated! Round ${state.currentRound} complete.`);
        return;
    }

    // Draw back to hand size
    refillHand(player, client.sessionId);
}
