import { calculateDamage as sharedCalculateDamage, type ResolvedSpell } from "../../shared";
import type { EnemyState } from "../../shared";

// Server-side wrapper that adapts EnemyState's ArraySchema fields into plain
// arrays before delegating to the shared formula. The shared version is used
// directly on the client for the floating per-rune damage numbers, so both
// sides agree on what the displayed numbers should sum to.
export function calculateDamage(spell: ResolvedSpell, enemy: EnemyState): number {
    const resistances = Array.from(enemy.resistances);
    const weaknesses = Array.from(enemy.weaknesses);
    return sharedCalculateDamage(spell, resistances, weaknesses);
}
