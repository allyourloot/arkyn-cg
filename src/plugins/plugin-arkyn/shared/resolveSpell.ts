import { COMBINABLE_ELEMENTS, type ElementType } from "./arkynConstants";
import { SPELL_TABLE, COMBO_TABLE, type SpellInfo } from "./spellTable";

export interface ResolvedSpell {
    spellName: string;
    tier: number;
    element: ElementType;
    baseDamage: number;
    description: string;
    isCombo: boolean;
    comboElements?: [ElementType, ElementType];
}

export interface RuneData {
    element: string;
}

export function resolveSpell(runes: RuneData[]): ResolvedSpell | null {
    if (runes.length === 0) return null;

    // Count element frequencies
    const freq = new Map<string, number>();
    for (const rune of runes) {
        freq.set(rune.element, (freq.get(rune.element) ?? 0) + 1);
    }

    // Find highest-count element
    let primaryElement = "";
    let primaryCount = 0;
    for (const [element, count] of freq) {
        if (count > primaryCount) {
            primaryCount = count;
            primaryElement = element;
        }
    }

    // Check for combo spell: must have exactly 2 distinct combinable elements
    const distinctElements = [...freq.keys()];
    const allCombinable = distinctElements.every(e =>
        (COMBINABLE_ELEMENTS as readonly string[]).includes(e)
    );

    if (allCombinable && distinctElements.length === 2) {
        const sorted = [...distinctElements].sort() as [string, string];
        const comboKey = `${sorted[0]}+${sorted[1]}`;
        const comboSpell = COMBO_TABLE[comboKey];

        if (comboSpell) {
            const tier = Math.min(runes.length, 5);
            return {
                spellName: comboSpell.name,
                tier,
                element: primaryElement as ElementType,
                baseDamage: comboSpell.baseDamage,
                description: comboSpell.description,
                isCombo: true,
                comboElements: sorted as [ElementType, ElementType],
            };
        }
    }

    // Single-element spell or fallback to highest-count element
    const tier = Math.min(primaryCount, 5);
    const element = primaryElement as ElementType;
    const spellInfo: SpellInfo | undefined = SPELL_TABLE[element]?.[tier];

    if (!spellInfo) return null;

    return {
        spellName: spellInfo.name,
        tier,
        element,
        baseDamage: spellInfo.baseDamage,
        description: spellInfo.description,
        isCombo: false,
    };
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
 * For a combo spell, every rune matching one of the two combo elements
 * contributes (combos require all played runes to be combo-compatible).
 *
 * Returns `[]` if `runes` doesn't resolve to a spell at all.
 *
 * Used by the client to drive the per-rune damage bubble UI; lives in the
 * shared layer alongside `resolveSpell` so the rule for "which runes
 * counted" stays in one place.
 */
export function getContributingRuneIndices(runes: RuneData[]): number[] {
    if (runes.length === 0) return [];
    const spell = resolveSpell(runes);
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
