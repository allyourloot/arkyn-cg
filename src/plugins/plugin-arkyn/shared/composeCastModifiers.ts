import {
    getHandMultBonus,
    getIgnoredResistanceElements,
    getPlayedMultBonus,
    getSpellXMult,
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
 *  - `bonusMult`: additive mult bonus (hand-mult + played-mult totals)
 *  - `xMult`: multiplicative factor applied after additive bonuses
 *  - `effectiveResistances`: enemy resistances with resist-ignore sigils' elements stripped
 *  - `breakdowns`: per-sigil entries the client animation layer consumes for
 *    hand bubbles, played-rune mult ticks, and xMult reveals. The server
 *    uses only the totals.
 */
export interface CastModifiersBreakdown {
    handMult: HandMultEntry[];
    playedMult: PlayedMultEntry[];
    xMult: SpellXMultEntry[];
}

export interface CastModifiersResult {
    bonusMult: number;
    xMult: number;
    effectiveResistances: string[];
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
}

export function composeCastModifiers(args: ComposeCastModifiersArgs): CastModifiersResult {
    const { sigils, spellElements, hand, selectedIndices, contributingRunes, rawResistances } = args;

    const handMult = getHandMultBonus(sigils, hand, selectedIndices);
    const playedMult = getPlayedMultBonus(sigils, contributingRunes);
    const xMult = getSpellXMult(sigils, spellElements);

    const ignoredResistances = getIgnoredResistanceElements(sigils);
    const effectiveResistances = ignoredResistances.size > 0
        ? rawResistances.filter(e => !ignoredResistances.has(e))
        : [...rawResistances];

    return {
        bonusMult: handMult.total + playedMult.total,
        xMult: xMult.total,
        effectiveResistances,
        breakdowns: {
            handMult: handMult.perSigil,
            playedMult: playedMult.perSigil,
            xMult: xMult.entries,
        },
    };
}
