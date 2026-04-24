import {
    getAccumulatorXMult,
    getCastRngMultBonus,
    getElementRuneBonus,
    getHandMultBonus,
    getIgnoredResistanceElements,
    getInventoryMultBonus,
    getPlayedMultBonus,
    getSpellTierMultBonus,
    getSpellXMult,
    type AccumulatorXMultEntry,
    type CastRngMultEntry,
    type ElementRuneBonusEntry,
    type HandMultEntry,
    type InventoryMultEntry,
    type PlayedMultEntry,
    type SpellTierMultEntry,
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
 *    each rune's POST-modifier contribution (today driven by element-rune-bonus
 *    sigils like Engine and Lex Divina). Feed this into `calculateSpellDamage`
 *    so the bonus lands inside `runeBaseContributions[i]` — bubble displays +
 *    proc double-damage automatically pick it up.
 *  - `breakdowns`: per-sigil entries the client animation layer consumes for
 *    hand bubbles, played-rune mult ticks, xMult reveals, and element-rune-bonus
 *    mult ticks. The server uses only the totals.
 */
export interface CastModifiersBreakdown {
    handMult: HandMultEntry[];
    playedMult: PlayedMultEntry[];
    xMult: SpellXMultEntry[];
    accumulatorXMult: AccumulatorXMultEntry[];
    elementRuneBonus: ElementRuneBonusEntry[];
    inventoryMult: InventoryMultEntry[];
    spellTierMult: SpellTierMultEntry[];
    castRngMult: CastRngMultEntry[];
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
    /**
     * The resolved spell's tier. Used by `SIGIL_SPELL_TIER_MULT` (Tectonic
     * pattern) to gate additive mult bonuses on specific tiers. Pass `0`
     * when the cast didn't resolve to a scoring spell — the helper no-ops
     * for tier ≤ 0 so the additive channel stays clean.
     */
    spellTier: number;
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
    /**
     * Element whose resistance is dynamically nullified this round (today:
     * Binoculars' round-start pick, stored on `player.disabledResistance`).
     * Merged with the static SIGIL_RESIST_IGNORE registry at the ignore-set
     * level so both paths feed `effectiveResistances` identically. Empty
     * string / undefined = no dynamic selection.
     */
    disabledResistance?: string;
    /**
     * Per-sigil persistent accumulator values (Executioner pattern). Keyed
     * by sigil ID; read from `player.sigilAccumulators`. Missing keys fall
     * back to the category definition's `initialValue`. Empty object / omit
     * = no accumulator sigils owned.
     */
    sigilAccumulators?: Readonly<Record<string, number>>;
    /**
     * RNG inputs for Category 17 (Cast-RNG Mult — Boom Bomb). When all three
     * are provided, the helper rolls a per-cast mult bonus per owned sigil
     * keyed by `(runSeed, round, castNumber)`. Omit any to skip the category
     * (returns 0 bonusMult contribution, empty entries) — callers without a
     * cast-budget context (e.g. static previews) can leave these undefined.
     * Server and client pass the same values so rolls agree byte-for-byte.
     */
    runSeed?: number;
    round?: number;
    castNumber?: number;
}

export function composeCastModifiers(args: ComposeCastModifiersArgs): CastModifiersResult {
    const { sigils, spellElements, spellTier, hand, selectedIndices, contributingRunes, rawResistances, weaknesses, disabledResistance, sigilAccumulators, runSeed, round, castNumber } = args;

    const handMult = getHandMultBonus(sigils, hand, selectedIndices);
    const playedMult = getPlayedMultBonus(sigils, contributingRunes);
    const xMult = getSpellXMult(sigils, spellElements);
    const accumulatorXMult = getAccumulatorXMult(sigils, sigilAccumulators ?? {});
    const inventoryMult = getInventoryMultBonus(sigils);
    const spellTierMult = getSpellTierMultBonus(sigils, spellTier);
    const castRngMult = (runSeed !== undefined && round !== undefined && castNumber !== undefined)
        ? getCastRngMultBonus(sigils, runSeed, round, castNumber)
        : { total: 0, entries: [] as CastRngMultEntry[] };

    // Per-rune crit flag, identical to the damage formula's derivation
    // (weakness match = critical). Computed here so crit-gated sigils
    // (Lex Divina et al.) can short-circuit without re-running the formula.
    const contributingElements = contributingRunes.map(r => r.element);
    const isCritical = contributingElements.map(e => weaknesses.includes(e));
    const elementRuneBonus = getElementRuneBonus(sigils, contributingElements, isCritical);

    const ignoredResistances = getIgnoredResistanceElements(sigils, disabledResistance);
    const effectiveResistances = ignoredResistances.size > 0
        ? rawResistances.filter(e => !ignoredResistances.has(e))
        : [...rawResistances];

    return {
        bonusMult: handMult.total + playedMult.total + elementRuneBonus.totalMult + inventoryMult.total + spellTierMult.total + castRngMult.total,
        xMult: xMult.total * accumulatorXMult.total,
        effectiveResistances,
        perRuneBaseBonus: elementRuneBonus.perRuneBase,
        breakdowns: {
            handMult: handMult.perSigil,
            playedMult: playedMult.perSigil,
            xMult: xMult.entries,
            accumulatorXMult: accumulatorXMult.entries,
            elementRuneBonus: elementRuneBonus.entries,
            inventoryMult: inventoryMult.entries,
            spellTierMult: spellTierMult.entries,
            castRngMult: castRngMult.entries,
        },
    };
}
