import {
    SPELL_TIER_BASE_DAMAGE,
    SPELL_TIER_MULT,
    RUNE_BASE_DAMAGE,
} from "./spellTable";
import type { RarityType } from "./arkynConstants";
import type { ResolvedSpell, RuneData } from "./resolveSpell";

/**
 * Per-rune damage breakdown — one entry per contributing rune in the spell.
 *
 * Drives the floating per-rune `RuneDamageBubble`s in the play area:
 * critical (weakness) runes pop twice — first the unmodified base, then
 * the boosted post-modifier amount in yellow — neutral and resisted runes
 * pop once. Both bubble values feed off the SAME breakdown that's used to
 * tick the Spell Preview's Base counter, so on-screen numbers and the
 * applied damage always agree.
 *
 * In the new Base + Mult model, `baseAmount` and `amount` represent the
 * rune's CONTRIBUTION TO THE BASE COUNTER (not its share of the final
 * post-mult damage). The post-mult final lives only in the
 * `SpellDamageBreakdown.finalDamage` field on the parent breakdown.
 */
export interface RuneDamageBreakdown {
    /** Pre-modifier per-rune base contribution (no resist/weak applied). */
    baseAmount: number;
    /** Post-modifier per-rune base contribution — what the rune actually adds to the Base counter. */
    amount: number;
    /** True if this specific rune's element is in the enemy's weaknesses. */
    isCritical: boolean;
    /** True if this specific rune's element is in the enemy's resistances. */
    isResisted: boolean;
}

/**
 * Full Base + Mult breakdown for a resolved spell. Produced once per cast
 * (server applies HP, client drives the cast animation + Spell Preview)
 * so the per-rune bubbles, the Base counter tick, and the floating enemy
 * damage number all read from the same numbers.
 *
 *   baseTotal   = spellBase + Σ runeBaseContributions
 *   finalDamage = baseTotal × mult
 *
 * `spellBase` and `mult` are flat per-tier constants from spellTable.ts;
 * each rune's contribution is RUNE_BASE_DAMAGE[rarity] modified per-rune
 * by enemy weakness (×1.5 → critical) or resistance (×0.5 → resisted).
 */
export interface SpellDamageBreakdown {
    /** Per-tier flat base from SPELL_TIER_BASE_DAMAGE[spell.tier]. */
    spellBase: number;
    /** Per-rune base contributions, AFTER per-rune resist/weak mod. Indices align with the contributingRunes input. */
    runeBaseContributions: number[];
    /** Per-rune base contributions BEFORE the resist/weak mod — the bubble's first-pop value for criticals. */
    runeBasePreModifier: number[];
    /** spellBase + sum(runeBaseContributions). */
    baseTotal: number;
    /** Per-tier multiplier from SPELL_TIER_MULT[spell.tier]. */
    mult: number;
    /** baseTotal × mult — the final value applied to the enemy. */
    finalDamage: number;
    /** Per-rune crit flag (element is in the enemy's weaknesses). */
    isCritical: boolean[];
    /** Per-rune resisted flag (element is in the enemy's resistances and not weak). */
    isResisted: boolean[];
}

/**
 * Compute the full Base + Mult breakdown for a resolved spell. Pure
 * function — server and client both call this with the same inputs and
 * get identical numbers.
 *
 * `contributingRuneRarities` runs in parallel with `contributingRunes`
 * (same length, same order) so the formula can look up each rune's base
 * damage by rarity. We pass it as a parallel array rather than embedding
 * rarity into `RuneData` because `RuneData` is a minimal type used by
 * `resolveSpell`/`getContributingRuneIndices` that intentionally only
 * carries `element`.
 */
export function calculateSpellDamage(
    spell: ResolvedSpell,
    contributingRunes: readonly RuneData[],
    contributingRuneRarities: readonly RarityType[],
    resistances: readonly string[],
    weaknesses: readonly string[],
): SpellDamageBreakdown {
    const spellBase = SPELL_TIER_BASE_DAMAGE[spell.tier] ?? 0;
    const mult = SPELL_TIER_MULT[spell.tier] ?? 1;

    const count = contributingRunes.length;
    const runeBaseContributions: number[] = new Array(count);
    const runeBasePreModifier: number[] = new Array(count);
    const isCritical: boolean[] = new Array(count);
    const isResisted: boolean[] = new Array(count);

    let runeBaseSum = 0;
    for (let i = 0; i < count; i++) {
        const element = contributingRunes[i].element;
        // Defensive fallback to common — keeps the formula safe if a
        // future rune slips through without a recognized rarity.
        const rarity = contributingRuneRarities[i] ?? "common";
        const preMod = RUNE_BASE_DAMAGE[rarity] ?? RUNE_BASE_DAMAGE.common;
        const crit = weaknesses.includes(element);
        const resist = !crit && resistances.includes(element);
        const mod = crit ? 1.5 : resist ? 0.5 : 1.0;
        const post = Math.round(preMod * mod);

        runeBasePreModifier[i] = preMod;
        runeBaseContributions[i] = post;
        isCritical[i] = crit;
        isResisted[i] = resist;
        runeBaseSum += post;
    }

    const baseTotal = spellBase + runeBaseSum;
    const finalDamage = baseTotal * mult;

    return {
        spellBase,
        runeBaseContributions,
        runeBasePreModifier,
        baseTotal,
        mult,
        finalDamage,
        isCritical,
        isResisted,
    };
}

/**
 * Backwards-compatible per-rune view of the breakdown — `baseAmount` is
 * the pre-modifier rune base, `amount` is the post-modifier contribution
 * to the Base counter. Used by `RuneDamageBubble` (which still wants the
 * base→boosted swap on criticals) and the cast animation orchestrator
 * for its event timeline.
 */
export function calculateRuneDamageBreakdown(
    spell: ResolvedSpell,
    contributingRunes: readonly RuneData[],
    contributingRuneRarities: readonly RarityType[],
    resistances: readonly string[],
    weaknesses: readonly string[],
): RuneDamageBreakdown[] {
    const breakdown = calculateSpellDamage(
        spell,
        contributingRunes,
        contributingRuneRarities,
        resistances,
        weaknesses,
    );
    const out: RuneDamageBreakdown[] = new Array(contributingRunes.length);
    for (let i = 0; i < contributingRunes.length; i++) {
        out[i] = {
            baseAmount: breakdown.runeBasePreModifier[i],
            amount: breakdown.runeBaseContributions[i],
            isCritical: breakdown.isCritical[i],
            isResisted: breakdown.isResisted[i],
        };
    }
    return out;
}

/**
 * Final post-mult damage applied to the enemy. Same formula as the
 * authoritative server-side path — handleCast.ts calls this and decrements
 * `enemy.currentHp` by the result, while the client uses it to populate
 * the floating enemy damage number on the impact frame.
 */
export function calculateDamage(
    spell: ResolvedSpell,
    contributingRunes: readonly RuneData[],
    contributingRuneRarities: readonly RarityType[],
    resistances: readonly string[],
    weaknesses: readonly string[],
): number {
    return calculateSpellDamage(
        spell,
        contributingRunes,
        contributingRuneRarities,
        resistances,
        weaknesses,
    ).finalDamage;
}
