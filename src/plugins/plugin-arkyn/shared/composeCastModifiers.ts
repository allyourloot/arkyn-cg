import {
    getCriticalRuneBonus,
    getHandMultBonus,
    getIgnoredResistanceElements,
    getPlayedMultBonus,
    getSpellXMult,
    type CriticalRuneBonusEntry,
    type HandMultEntry,
    type PlayedMultEntry,
    type SpellXMultEntry,
} from "./sigilEffects";

/**
 * Shared helper that composes all sigil-driven cast modifiers. The server
 * damage calculator and the client cast-animation pipeline both call this
 * with the same inputs so their numbers cannot drift — adding a new
 * additive-mult or xMult category means updating this one file.
 *
 * Returns:
 *  - `bonusMult`: additive mult bonus (hand-mult + played-mult + crit-rune-bonus totals)
 *  - `xMult`: multiplicative factor applied after additive bonuses
 *  - `effectiveResistances`: enemy resistances with resist-ignore sigils' elements stripped
 *  - `perRuneBaseBonus`: parallel to `contributingRunes`; flat base damage added to
 *    each rune's POST-modifier contribution (today driven by crit-rune-bonus sigils
 *    like Lex Divina). Feed this into `calculateSpellDamage` so the bonus lands
 *    inside `runeBaseContributions[i]` — bubble displays + proc double-damage
 *    automatically pick it up.
 *  - `breakdowns`: per-sigil entries the client animation layer consumes for
 *    hand bubbles, played-rune mult ticks, xMult reveals, and crit-rune-bonus
 *    mult ticks. The server uses only the totals.
 */
export interface CastModifiersBreakdown {
    handMult: HandMultEntry[];
    playedMult: PlayedMultEntry[];
    xMult: SpellXMultEntry[];
    critRuneBonus: CriticalRuneBonusEntry[];
}

export interface CastModifiersResult {
    bonusMult: number;
    xMult: number;
    effectiveResistances: string[];
    /** Parallel to `contributingRunes`; 0 when no sigil adds base to that rune. */
    perRuneBaseBonus: number[];
    breakdowns: CastModifiersBreakdown;
}

export interface ComposeCastModifiersArgs {
    /** Active sigil IDs; pass `[]` for none. */
    sigils: readonly string[];
    /** Elements involved in the resolved spell — `[spell.element]` or `spell.comboElements`. */
    spellElements: readonly string[];
    /** The player's full hand; used for hand-mult lookup. */
    hand: readonly { element: string }[];
    /** Indices into `hand` that were selected (excluded from hand-mult). */
    selectedIndices: readonly number[];
    /** Runes that contribute to the resolved spell (post-filter of the selection). */
    contributingRunes: readonly { element: string }[];
    /** Enemy's raw resistance elements. */
    rawResistances: readonly string[];
    /** Enemy's weakness elements. Used to derive per-rune crit flags for crit-gated sigils. */
    weaknesses: readonly string[];
}

export function composeCastModifiers(args: ComposeCastModifiersArgs): CastModifiersResult {
    const { sigils, spellElements, hand, selectedIndices, contributingRunes, rawResistances, weaknesses } = args;

    const handMult = getHandMultBonus(sigils, hand, selectedIndices);
    const playedMult = getPlayedMultBonus(sigils, contributingRunes);
    const xMult = getSpellXMult(sigils, spellElements);

    // Per-rune crit flag, identical to the damage formula's derivation
    // (weakness match = critical). Computed here so crit-gated sigils
    // (Lex Divina et al.) can short-circuit without re-running the formula.
    const contributingElements = contributingRunes.map(r => r.element);
    const isCritical = contributingElements.map(e => weaknesses.includes(e));
    const critRuneBonus = getCriticalRuneBonus(sigils, contributingElements, isCritical);

    const ignoredResistances = getIgnoredResistanceElements(sigils);
    const effectiveResistances = ignoredResistances.size > 0
        ? rawResistances.filter(e => !ignoredResistances.has(e))
        : [...rawResistances];

    return {
        bonusMult: handMult.total + playedMult.total + critRuneBonus.totalMult,
        xMult: xMult.total,
        effectiveResistances,
        perRuneBaseBonus: critRuneBonus.perRuneBase,
        breakdowns: {
            handMult: handMult.perSigil,
            playedMult: playedMult.perSigil,
            xMult: xMult.entries,
            critRuneBonus: critRuneBonus.entries,
        },
    };
}
