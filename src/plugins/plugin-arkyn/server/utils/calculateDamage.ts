import { TIER_MULTIPLIERS, type ResolvedSpell } from "../../shared";
import type { EnemyState } from "../../shared";

export function calculateDamage(spell: ResolvedSpell, enemy: EnemyState): number {
    const tierMult = TIER_MULTIPLIERS[spell.tier] ?? 1.0;

    // Elemental modifier based on enemy resistances/weaknesses
    let elementalMod = 1.0;
    const checkElement = spell.element;

    const resistances: string[] = [];
    for (let i = 0; i < enemy.resistances.length; i++) {
        resistances.push(enemy.resistances[i]);
    }
    const weaknesses: string[] = [];
    for (let i = 0; i < enemy.weaknesses.length; i++) {
        weaknesses.push(enemy.weaknesses[i]);
    }

    if (resistances.includes(checkElement)) {
        elementalMod = 0.5;
    } else if (weaknesses.includes(checkElement)) {
        elementalMod = 1.5;
    }

    // For combo spells, also check the secondary element
    if (spell.isCombo && spell.comboElements) {
        const secondaryElement = spell.comboElements.find(e => e !== spell.element);
        if (secondaryElement) {
            if (weaknesses.includes(secondaryElement)) {
                elementalMod = Math.max(elementalMod, 1.5);
            }
        }
    }

    return Math.round(spell.baseDamage * tierMult * elementalMod);
}
