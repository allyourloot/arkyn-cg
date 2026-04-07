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
