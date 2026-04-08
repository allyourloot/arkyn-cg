import { TIER_MULTIPLIERS } from "./spellTable";
import type { ResolvedSpell } from "./resolveSpell";

/**
 * Computes the final damage of a resolved spell against an enemy with the
 * given resistances and weaknesses.
 *
 * The same formula runs on the server (authoritative — applied to enemy HP)
 * and on the client (used to drive the floating per-rune damage numbers in
 * the cast animation). Keeping it shared guarantees that the per-rune
 * numbers the player sees always sum to the actual damage dealt.
 */
export function calculateDamage(
    spell: ResolvedSpell,
    resistances: readonly string[],
    weaknesses: readonly string[],
): number {
    const tierMult = TIER_MULTIPLIERS[spell.tier] ?? 1.0;

    let elementalMod = 1.0;
    if (resistances.includes(spell.element)) {
        elementalMod = 0.5;
    } else if (weaknesses.includes(spell.element)) {
        elementalMod = 1.5;
    }

    // For combo spells, also check the secondary element so a target with
    // weakness to either combo element gets the bonus.
    if (spell.isCombo && spell.comboElements) {
        const secondaryElement = spell.comboElements.find(e => e !== spell.element);
        if (secondaryElement && weaknesses.includes(secondaryElement)) {
            elementalMod = Math.max(elementalMod, 1.5);
        }
    }

    return Math.round(spell.baseDamage * tierMult * elementalMod);
}
