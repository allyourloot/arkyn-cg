import {
    SPELL_TIER_BASE_DAMAGE,
    SPELL_TIER_MULT,
    RUNE_BASE_DAMAGE,
} from "./spellTable";
import { SCROLL_RUNE_BONUS } from "./arkynConstants";
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
 * In the Base + Mult model, `baseAmount` and `amount` represent the
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
 * each rune's contribution is (RUNE_BASE_DAMAGE[rarity] + scrollBonus)
 * modified per-rune by enemy weakness (×2.0) or resistance (×0.5).
 * Scroll bonuses increase a rune's flat base damage, so they compound
 * with weakness/resistance and the tier multiplier naturally.
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

/** Scroll levels accessor — works with Map (client) and MapSchema (server). */
type ScrollLevelsLike = ReadonlyMap<string, number> | { get(key: string): number | undefined };

/**
 * Compute the full Base + Mult breakdown for a resolved spell. Pure
 * function — server and client both call this with the same inputs and
 * get identical numbers.
 *
 * `scrollLevels` maps element name → number of scrolls purchased for
 * that element. Each scroll adds SCROLL_RUNE_BONUS (+2) to the flat
 * per-rune base damage of runes matching that element. The bonus is
 * applied per-rune BEFORE resist/weak modifiers, so it compounds with
 * weakness (×2) and the tier multiplier naturally.
 */
export function calculateSpellDamage(
    spell: ResolvedSpell,
    contributingRunes: readonly RuneData[],
    contributingRuneRarities: readonly RarityType[],
    resistances: readonly string[],
    weaknesses: readonly string[],
    scrollLevels?: ScrollLevelsLike,
    bonusMult?: number,
    xMult?: number,
    /**
     * Optional per-rune flat base bonus, parallel to `contributingRunes`.
     * Added AFTER the resist/weak modifier so it reads as "+N to the damage
     * that lands" rather than compounding with ×2 weakness. Today driven
     * by crit-rune-bonus sigils (Lex Divina); see `composeCastModifiers`.
     */
    perRuneBaseBonus?: readonly number[],
): SpellDamageBreakdown {
    const spellBase = SPELL_TIER_BASE_DAMAGE[spell.tier] ?? 0;
    const mult = ((SPELL_TIER_MULT[spell.tier] ?? 0) + (bonusMult ?? 0)) * (xMult ?? 1);

    const count = contributingRunes.length;
    const runeBaseContributions: number[] = new Array(count);
    const runeBasePreModifier: number[] = new Array(count);
    const isCritical: boolean[] = new Array(count);
    const isResisted: boolean[] = new Array(count);

    let runeBaseSum = 0;
    for (let i = 0; i < count; i++) {
        const element = contributingRunes[i].element;
        const rarity = contributingRuneRarities[i] ?? "common";
        const runeBase = RUNE_BASE_DAMAGE[rarity] ?? RUNE_BASE_DAMAGE.common;
        const scrollBonus = scrollLevels
            ? (scrollLevels.get(element) ?? 0) * SCROLL_RUNE_BONUS
            : 0;
        const preMod = runeBase + scrollBonus;
        const crit = weaknesses.includes(element);
        const resist = !crit && resistances.includes(element);
        const mod = crit ? 2.0 : resist ? 0.5 : 1.0;
        const post = Math.round(preMod * mod) + (perRuneBaseBonus?.[i] ?? 0);

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
 * Backwards-compatible per-rune view of the breakdown.
 */
export function calculateRuneDamageBreakdown(
    spell: ResolvedSpell,
    contributingRunes: readonly RuneData[],
    contributingRuneRarities: readonly RarityType[],
    resistances: readonly string[],
    weaknesses: readonly string[],
    scrollLevels?: ScrollLevelsLike,
): RuneDamageBreakdown[] {
    const breakdown = calculateSpellDamage(
        spell,
        contributingRunes,
        contributingRuneRarities,
        resistances,
        weaknesses,
        scrollLevels,
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
 * Final post-mult damage applied to the enemy.
 */
export function calculateDamage(
    spell: ResolvedSpell,
    contributingRunes: readonly RuneData[],
    contributingRuneRarities: readonly RarityType[],
    resistances: readonly string[],
    weaknesses: readonly string[],
    scrollLevels?: ScrollLevelsLike,
): number {
    return calculateSpellDamage(
        spell,
        contributingRunes,
        contributingRuneRarities,
        resistances,
        weaknesses,
        scrollLevels,
    ).finalDamage;
}
