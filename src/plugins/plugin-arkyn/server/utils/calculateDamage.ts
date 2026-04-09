import {
    calculateDamage as sharedCalculateDamage,
    getContributingRuneIndices,
    type ResolvedSpell,
    type RuneInstance,
    type EnemyState,
} from "../../shared";

// Server-side wrapper that adapts EnemyState's ArraySchema fields into plain
// arrays, derives the contributing runes from the player's selection, and
// delegates to the shared per-rune formula. Each contributing rune is
// evaluated against the enemy's resistances/weaknesses individually — so a
// combo spell only crits the runes whose specific element matches a
// weakness, not the whole spell.
//
// The shared version runs on the client too (driving the floating per-rune
// damage bubbles), so server and client always agree on the displayed and
// applied damage.
export function calculateDamage(
    spell: ResolvedSpell,
    selectedRunes: readonly RuneInstance[],
    enemy: EnemyState,
): number {
    const resistances = Array.from(enemy.resistances);
    const weaknesses = Array.from(enemy.weaknesses);
    const contributingIndices = getContributingRuneIndices(
        selectedRunes.map(r => ({ element: r.element })),
    );
    const contributingRunes = contributingIndices.map(i => ({ element: selectedRunes[i].element }));
    return sharedCalculateDamage(spell, contributingRunes, resistances, weaknesses);
}
