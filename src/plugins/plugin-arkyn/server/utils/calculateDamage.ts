import {
    calculateDamage as sharedCalculateDamage,
    getContributingRuneIndices,
    type ResolvedSpell,
    type RuneInstance,
    type EnemyState,
} from "../../shared";
import type { RarityType } from "../../shared/arkynConstants";

// Server-side wrapper that adapts EnemyState's ArraySchema fields into plain
// arrays, derives the contributing runes from the player's selection, and
// delegates to the shared Base + Mult formula. Each contributing rune is
// evaluated against the enemy's resistances/weaknesses individually — so a
// combo spell only crits the runes whose specific element matches a
// weakness, not the whole spell.
//
// The shared version runs on the client too (driving the per-rune damage
// bubbles + the Spell Preview Base counter), so server and client always
// agree on the displayed and applied damage.
//
// We build a parallel `contributingRuneRarities` array here so the shared
// formula can look up each rune's RUNE_BASE_DAMAGE by rarity. RuneData
// (the type the shared formula consumes) deliberately only carries
// `element`, so rarity rides alongside rather than embedded.
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
    const contributingRuneRarities = contributingIndices.map(
        i => selectedRunes[i].rarity as RarityType,
    );
    return sharedCalculateDamage(
        spell,
        contributingRunes,
        contributingRuneRarities,
        resistances,
        weaknesses,
    );
}
