import type { MapSchema } from "@colyseus/schema";
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
// delegates to the shared damage formula. Scroll bonuses are applied per-rune
// inside the shared formula — each rune's element is looked up in the
// scrollLevels map to add flat base damage from purchased scrolls.
export function calculateDamage(
    spell: ResolvedSpell,
    selectedRunes: readonly RuneInstance[],
    enemy: EnemyState,
    scrollLevels?: MapSchema<number>,
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
        scrollLevels,
    );
}
