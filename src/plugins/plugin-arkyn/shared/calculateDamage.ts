import { TIER_MULTIPLIERS } from "./spellTable";
import type { ResolvedSpell, RuneData } from "./resolveSpell";

/**
 * Per-rune damage breakdown — one entry per contributing rune in the spell.
 * Each entry knows its own pre-modifier base, post-modifier amount, and
 * whether the rune triggered a critical (weakness) or was resisted.
 *
 * Drives the floating damage bubbles in the play area: critical runes pop
 * twice (base → boosted in yellow), neutral and resisted runes pop once.
 */
export interface RuneDamageBreakdown {
    /** Pre-modifier per-rune damage (before resistance / weakness applied). */
    baseAmount: number;
    /** Post-modifier per-rune damage — what actually contributes to total. */
    amount: number;
    /** True if this specific rune's element is in the enemy's weaknesses. */
    isCritical: boolean;
    /** True if this specific rune's element is in the enemy's resistances. */
    isResisted: boolean;
}

/**
 * Computes per-rune damage for every contributing rune in a spell. Each
 * rune is evaluated against the enemy's resistances/weaknesses INDIVIDUALLY
 * — so a Flash Freeze (3 ice + 1 water) cast on a water-weak enemy crits
 * ONLY the water rune, leaving the ice runes at their neutral base damage.
 *
 * The total spell base (`spell.baseDamage * tierMult`) is distributed
 * evenly across contributing runes (with any remainder spread across the
 * first few runes) so per-rune base values always sum to exactly the
 * spell's base. The post-modifier amounts then sum to the spell's final
 * damage applied to the enemy.
 *
 * Used by both the server (authoritative — sums for enemy HP) and the
 * client (drives the floating per-rune bubbles), so the displayed numbers
 * always match the damage actually dealt.
 */
export function calculateRuneDamageBreakdown(
    spell: ResolvedSpell,
    contributingRunes: readonly RuneData[],
    resistances: readonly string[],
    weaknesses: readonly string[],
): RuneDamageBreakdown[] {
    const contributing = contributingRunes.length;
    if (contributing === 0) return [];

    const tierMult = TIER_MULTIPLIERS[spell.tier] ?? 1.0;
    // Total base = spell.baseDamage × tierMult (matches the legacy aggregate
    // formula). Distributed across contributing runes; remainder spread to
    // the first few so per-rune sums are exact.
    const totalBase = spell.baseDamage * tierMult;
    const perRuneBaseFloor = Math.floor(totalBase / contributing);
    const perRuneBaseRemainder = totalBase - perRuneBaseFloor * contributing;

    const out: RuneDamageBreakdown[] = [];
    for (let i = 0; i < contributing; i++) {
        const runeElement = contributingRunes[i].element;
        const baseAmount = perRuneBaseFloor + (i < perRuneBaseRemainder ? 1 : 0);
        const isCritical = weaknesses.includes(runeElement);
        const isResisted = !isCritical && resistances.includes(runeElement);
        const mod = isCritical ? 1.5 : isResisted ? 0.5 : 1.0;
        out.push({
            baseAmount,
            amount: Math.round(baseAmount * mod),
            isCritical,
            isResisted,
        });
    }
    return out;
}

/**
 * Sums the per-rune breakdown into the final spell damage applied to the
 * enemy. The same function runs on the server (authoritative) and the
 * client (animation preview), so the on-screen numbers and the HP change
 * always agree.
 */
export function calculateDamage(
    spell: ResolvedSpell,
    contributingRunes: readonly RuneData[],
    resistances: readonly string[],
    weaknesses: readonly string[],
): number {
    const breakdown = calculateRuneDamageBreakdown(spell, contributingRunes, resistances, weaknesses);
    let total = 0;
    for (const b of breakdown) total += b.amount;
    return total;
}
