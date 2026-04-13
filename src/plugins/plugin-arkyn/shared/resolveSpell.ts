import { type ElementType } from "./arkynConstants";
import {
    SPELL_TABLE,
    TWO_PAIR_TABLE,
    FULL_HOUSE_TABLE,
    isSynergyPair,
    type SpellInfo,
} from "./spellTable";

// `duo` is kept in the union for the future shop-unlock path that
// re-enables loose-duo combos (COMBO_TABLE). In the base game, only
// `single`, `two_pair`, and `full_house` can be resolved.
export type SpellShape = "single" | "duo" | "two_pair" | "full_house";

export interface ResolvedSpell {
    spellName: string;
    tier: number;
    element: ElementType;
    description: string;
    isCombo: boolean;
    /**
     * The pattern this spell matched. `single` for single-element spells,
     * `duo` for the loose 2-element COMBO_TABLE matches (Electrocution
     * etc.), and `two_pair` / `full_house` for the new poker shapes.
     * Drives the SpellPreview tier label so the player can see WHY a
     * combo fired.
     */
    shape: SpellShape;
    comboElements?: [ElementType, ElementType];
}

export interface RuneData {
    element: string;
}

// ----- Shape classification -----
//
// Both `resolveSpell` and `getContributingRuneIndices` need to look at
// the same frequency analysis (which elements were played, how many of
// each, what poker shape does this represent). Doing it once here keeps
// the resolver and the contributing-rune selector in lockstep — the only
// way they can disagree is if the helper itself returns the wrong info,
// which means there's a single function to test/debug.
//
// `entries` is sorted by descending count so a [3, 2] full house is
// trivially `entries[0].count === 3 && entries[1].count === 2`.

interface ShapeEntry {
    element: string;
    count: number;
}

interface RuneShape {
    entries: ShapeEntry[];
    /**
     * The element with the highest count, used as the primary element
     * for color/icon and for the single-element fallback. On ties, the
     * first one encountered wins (matches the legacy resolver behavior).
     */
    primaryElement: string;
    primaryCount: number;
    distinctCount: number;
}

function classifyShape(runes: readonly RuneData[]): RuneShape | null {
    if (runes.length === 0) return null;

    // Count element frequencies in encounter order — Map preserves
    // insertion order, which is what the legacy tie-break depended on.
    const freq = new Map<string, number>();
    for (const rune of runes) {
        freq.set(rune.element, (freq.get(rune.element) ?? 0) + 1);
    }

    // Build entries and pick the primary in a single pass. Sort
    // afterwards so the resolver can pattern-match `entries[0].count`.
    let primaryElement = "";
    let primaryCount = 0;
    const entries: ShapeEntry[] = [];
    for (const [element, count] of freq) {
        entries.push({ element, count });
        if (count > primaryCount) {
            primaryCount = count;
            primaryElement = element;
        }
    }
    entries.sort((a, b) => b.count - a.count);

    return {
        entries,
        primaryElement,
        primaryCount,
        distinctCount: entries.length,
    };
}

function buildResolvedSpell(
    info: SpellInfo,
    tier: number,
    element: string,
    shape: SpellShape,
    comboElements?: [string, string],
): ResolvedSpell {
    return {
        spellName: info.name,
        tier,
        element: element as ElementType,
        description: info.description,
        isCombo: shape !== "single",
        shape,
        comboElements: comboElements as [ElementType, ElementType] | undefined,
    };
}

export function resolveSpell(
    runes: RuneData[],
    activeSigils?: readonly string[],
): ResolvedSpell | null {
    const shape = classifyShape(runes);
    if (!shape) return null;

    const e0 = shape.entries[0]?.count ?? 0;
    const e1 = shape.entries[1]?.count ?? 0;
    const e2 = shape.entries[2]?.count ?? 0;
    const isFullHouse = shape.distinctCount === 2 && e0 === 3 && e1 === 2;
    const isTwoPair = shape.distinctCount === 2 && e0 === 2 && e1 === 2;
    // Two Pair + kicker: 5 runes split [2, 2, 1]. The two paired
    // elements drive the synergy; the lone "kicker" is consumed by
    // the cast but contributes no damage. Lets a player burn an
    // unwanted rune as a quasi-discard while still firing the combo.
    const isTwoPairWithKicker =
        shape.distinctCount === 3 && e0 === 2 && e1 === 2 && e2 === 1;
    // 1. Full House — `[3, 2]`. Order matters: the 3-of element is the
    //    primary (drives spell color/icon), the table key is
    //    `${primary}+${secondary}`. Each synergy pair has TWO unique
    //    directional names (3F+2L = "Inferno Storm", 3L+2F = "Stormfire").
    if (isFullHouse) {
        const primary = shape.entries[0].element;
        const secondary = shape.entries[1].element;
        const info = FULL_HOUSE_TABLE[`${primary}+${secondary}`];
        if (info && isSynergyPair(primary, secondary, activeSigils)) {
            return buildResolvedSpell(info, 5, primary, "full_house", [primary, secondary]);
        }
        // No synergy for this pair — fall through to single-element.
    }

    // 2. Two Pair — `[2, 2]` (4 runes) or `[2, 2, 1]` (Two Pair plus
    //    a single kicker rune). Elements are interchangeable so the
    //    table key is alphabetically sorted. Primary element follows
    //    the legacy "first encountered" rule (via shape.primaryElement)
    //    so the spell color stays stable across reorders.
    //
    //    For the kicker variant, `comboElements` deliberately omits
    //    the kicker's element — `getContributingRuneIndices` filters
    //    by comboElements, so the kicker is excluded from the damage
    //    breakdown. The cast still consumes it from hand (handleCast
    //    removes by selected indices, not contributing indices), so
    //    the player can use the slot as a quasi-discard.
    if (isTwoPair || isTwoPairWithKicker) {
        const a = shape.entries[0].element;
        const b = shape.entries[1].element;
        const sorted: [string, string] = a < b ? [a, b] : [b, a];
        const info = TWO_PAIR_TABLE[`${sorted[0]}+${sorted[1]}`];
        if (info && isSynergyPair(a, b, activeSigils)) {
            return buildResolvedSpell(info, 4, shape.primaryElement, "two_pair", sorted);
        }
        // No synergy for this pair — fall through to single-element.
    }

    // NOTE: Loose duo combos (COMBO_TABLE) are intentionally disabled
    // in the base game. Mixed-element hands that don't form a synergy
    // poker shape (Two Pair / Full House) fall through to single-
    // element — the non-matching runes are wasted. This keeps the
    // poker analogy clean: only real "hands" score, and mismatched
    // runes are dead weight, creating meaningful commit-vs-hold
    // tension during play.
    //
    // The COMBO_TABLE content is preserved for a future shop item
    // (e.g. "Grimoire of Wild Magic") that unlocks loose-duo combos
    // as a run-wide power-up. When that item is equipped, re-enable
    // the loose-duo branch here (gate on a player/runtime flag).

    // 3. Single-element fallback — most-frequent element wins, tier
    //    equals that element's count (capped at 5). Hands that don't
    //    fit any combo shape (3-distinct, 4-distinct, 5-distinct, or
    //    [2,1,1]/[3,1,1]) land here, plus non-synergy poker shapes
    //    that fell through 1 and 2 above.
    const tier = Math.min(shape.primaryCount, 5);
    const info = SPELL_TABLE[shape.primaryElement as ElementType]?.[tier];
    if (!info) return null;
    return buildResolvedSpell(info, tier, shape.primaryElement, "single");
}

/**
 * Returns the indices of runes in `runes` that actually contribute to the
 * spell those runes would resolve to.
 *
 * For a single-element spell, that's the FIRST `tier` runes whose element
 * matches the spell — so a Tier 1 Fire spell with `[Fire, Water, Lightning]`
 * returns just `[0]`, while a Tier 2 Fire spell with
 * `[Fire, Fire, Water, Lightning]` returns `[0, 1]`.
 *
 * For any combo (loose duo, two pair, full house), every played rune
 * matching one of the combo elements contributes — for the new poker
 * shapes that's literally every rune in the hand, so no rune is ever
 * silently wasted.
 *
 * Returns `[]` if `runes` doesn't resolve to a spell at all.
 *
 * Used by the client to drive the per-rune damage bubble UI; lives in the
 * shared layer alongside `resolveSpell` so the rule for "which runes
 * counted" stays in one place.
 */
export function getContributingRuneIndices(
    runes: RuneData[],
    activeSigils?: readonly string[],
): number[] {
    if (runes.length === 0) return [];
    const spell = resolveSpell(runes, activeSigils);
    if (!spell) return [];

    if (spell.isCombo && spell.comboElements) {
        const combo = spell.comboElements as readonly string[];
        const out: number[] = [];
        for (let i = 0; i < runes.length; i++) {
            if (combo.includes(runes[i].element)) out.push(i);
        }
        return out;
    }

    // Single-element: take the first `tier` runes whose element matches.
    const out: number[] = [];
    for (let i = 0; i < runes.length && out.length < spell.tier; i++) {
        if (runes[i].element === spell.element) out.push(i);
    }
    return out;
}
