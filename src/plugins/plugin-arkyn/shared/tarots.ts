import type { ElementType } from "./arkynConstants";

// Tarot Cards — deck-mutation items granted by the Augury Pack. Each
// pack offers 5 random tarots over 8 sampled runes from the player's
// pouch. The player applies one tarot to selected runes (or to a
// chosen element for pouch-wide effects), the rest are discarded.
//
// Effect category notes:
//   - Most tarots produce mutations as `banishedRunes.push(original) +
//     acquiredRunes.push(mutated)` so `createPouch` rebuilds the new
//     pouch composition every round automatically.
//   - `duplicate` skips the banish step (originals stay).
//   - `banish` / `banishForGold` skip the add step.
//   - `upgradeAllOfElement` walks the live pouch (not the picker
//     snapshot) so it always reflects current pouch composition.
//   - `addRandomRune` adds one rune of weighted rarity, no rune target.

export type TarotEffect =
    | { type: "convertElement"; element: ElementType }
    | { type: "duplicate" }
    | { type: "upgradeRarity"; tiersUp: 1 | 2 }
    | { type: "consecrate" }                   // chosen element + rarity+1
    | { type: "fuse" }                          // 2 runes → 1 of chosen element with max(rarity)+1
    | { type: "wheelReroll" }                   // per-rune 50/50: upgrade rarity OR randomize element
    | { type: "banish" }                        // Hermit — no gold
    | { type: "banishForGold"; goldPerRune: number }   // Tower
    | { type: "upgradeAllOfElement" }           // Judgement (pouch-wide; 0 picker runes)
    | { type: "addRandomRune"; legendaryChance: number }; // World — Rare/Legendary roll

export interface TarotDefinition {
    /** snake_case id used as the registry key + serialized id over the wire. */
    id: string;
    /** Display name for the tarot card tooltip. */
    name: string;
    /** Roman / arabic numeral ornament for the tooltip header. */
    number: string;
    /** Player-facing one-liner describing the effect. */
    description: string;
    effect: TarotEffect;
    /** Min number of picker runes that must be selected for Apply to enable. */
    minTargets: number;
    /** Max number of picker runes that may be selected. */
    maxTargets: number;
    /** When true, the picker shows an element-pick row and an element must be chosen. */
    requiresElement?: boolean;
    /** Optional Apply-time rule over the picked runes. Currently only used by Strength. */
    targetConstraint?: "commonOrUncommonOnly";
    /**
     * Asset filename stem (no `_1x.png` / `_2x.png` suffix). The PNG
     * filenames are inconsistent in case (`0_theFool` vs `1_TheMagician`)
     * so each tarot carries its exact stem here for the asset loader.
     * `15_devil` is missing its `_1x` suffix — the loader handles that
     * via a fallback to the bare stem.
     */
    fileBasename: string;
}

export const TAROT_DEFINITIONS: Record<string, TarotDefinition> = {
    // Element conversions — one tarot per element. minTargets=1 so the
    // tarot is never a no-op; maxTargets=2 keeps the swing small.
    the_fool: {
        id: "the_fool",
        name: "The Fool",
        number: "0",
        description: "Convert up to 2 runes to Air.",
        effect: { type: "convertElement", element: "air" },
        minTargets: 1, maxTargets: 2,
        fileBasename: "0_theFool",
    },
    the_magician: {
        id: "the_magician",
        name: "The Magician",
        number: "I",
        description: "Duplicate up to 2 runes (adds copies to your pouch).",
        effect: { type: "duplicate" },
        minTargets: 1, maxTargets: 2,
        fileBasename: "1_TheMagician",
    },
    the_high_priestess: {
        id: "the_high_priestess",
        name: "The High Priestess",
        number: "II",
        description: "Convert up to 2 runes to Arcane.",
        effect: { type: "convertElement", element: "arcane" },
        minTargets: 1, maxTargets: 2,
        fileBasename: "2_theHighPriestess",
    },
    the_empress: {
        id: "the_empress",
        name: "The Empress",
        number: "III",
        description: "Upgrade up to 2 runes by 1 rarity tier.",
        effect: { type: "upgradeRarity", tiersUp: 1 },
        minTargets: 1, maxTargets: 2,
        fileBasename: "3_theEmpress",
    },
    the_emperor: {
        id: "the_emperor",
        name: "The Emperor",
        number: "IV",
        description: "Convert up to 2 runes to Earth.",
        effect: { type: "convertElement", element: "earth" },
        minTargets: 1, maxTargets: 2,
        fileBasename: "4_theEmperor",
    },
    the_hierophant: {
        id: "the_hierophant",
        name: "The Hierophant",
        number: "V",
        description: "Consecrate: convert up to 2 runes to a chosen element AND upgrade their rarity by 1 tier.",
        effect: { type: "consecrate" },
        minTargets: 1, maxTargets: 2,
        requiresElement: true,
        fileBasename: "5_theHierophant",
    },
    the_lovers: {
        id: "the_lovers",
        name: "The Lovers",
        number: "VI",
        description: "Fuse 2 runes into 1 rune of a chosen element with rarity = max(rarities) + 1.",
        effect: { type: "fuse" },
        minTargets: 2, maxTargets: 2,
        requiresElement: true,
        fileBasename: "6_theLovers",
    },
    the_chariot: {
        id: "the_chariot",
        name: "The Chariot",
        number: "VII",
        description: "Convert up to 2 runes to Lightning.",
        effect: { type: "convertElement", element: "lightning" },
        minTargets: 1, maxTargets: 2,
        fileBasename: "7_theChariot",
    },
    justice: {
        id: "justice",
        name: "Justice",
        number: "VIII",
        description: "Convert up to 2 runes to Steel.",
        effect: { type: "convertElement", element: "steel" },
        minTargets: 1, maxTargets: 2,
        fileBasename: "8_justice",
    },
    the_hermit: {
        id: "the_hermit",
        name: "The Hermit",
        number: "IX",
        description: "Banish 1 rune permanently from your pouch.",
        effect: { type: "banish" },
        minTargets: 1, maxTargets: 1,
        fileBasename: "9_theHermit",
    },
    wheel_of_fortune: {
        id: "wheel_of_fortune",
        name: "Wheel of Fortune",
        number: "X",
        description: "Reroll up to 3 runes — each has a 50% chance to upgrade rarity, otherwise becomes a random different element.",
        effect: { type: "wheelReroll" },
        minTargets: 1, maxTargets: 3,
        fileBasename: "10_wheelOfFortune",
    },
    strength: {
        id: "strength",
        name: "Strength",
        number: "XI",
        description: "Upgrade 1 Common or Uncommon rune by 2 rarity tiers.",
        effect: { type: "upgradeRarity", tiersUp: 2 },
        minTargets: 1, maxTargets: 1,
        targetConstraint: "commonOrUncommonOnly",
        fileBasename: "11_strength",
    },
    the_hanged_man: {
        id: "the_hanged_man",
        name: "The Hanged Man",
        number: "XII",
        description: "Convert up to 2 runes to Ice.",
        effect: { type: "convertElement", element: "ice" },
        minTargets: 1, maxTargets: 2,
        fileBasename: "12_theHangedMan",
    },
    death: {
        id: "death",
        name: "Death",
        number: "XIII",
        description: "Convert up to 2 runes to Death.",
        effect: { type: "convertElement", element: "death" },
        minTargets: 1, maxTargets: 2,
        fileBasename: "13_death",
    },
    temperance: {
        id: "temperance",
        name: "Temperance",
        number: "XIV",
        description: "Convert up to 2 runes to Water.",
        effect: { type: "convertElement", element: "water" },
        minTargets: 1, maxTargets: 2,
        fileBasename: "14_temperance",
    },
    the_devil: {
        id: "the_devil",
        name: "The Devil",
        number: "XV",
        description: "Convert up to 2 runes to Poison.",
        effect: { type: "convertElement", element: "poison" },
        minTargets: 1, maxTargets: 2,
        fileBasename: "15_devil",
    },
    the_tower: {
        id: "the_tower",
        name: "The Tower",
        number: "XVI",
        description: "Banish up to 3 runes; gain +3 gold per banished rune.",
        effect: { type: "banishForGold", goldPerRune: 3 },
        minTargets: 1, maxTargets: 3,
        fileBasename: "16_theTower",
    },
    the_star: {
        id: "the_star",
        name: "The Star",
        number: "XVII",
        description: "Convert up to 2 runes to Holy.",
        effect: { type: "convertElement", element: "holy" },
        minTargets: 1, maxTargets: 2,
        fileBasename: "17_theStar",
    },
    the_moon: {
        id: "the_moon",
        name: "The Moon",
        number: "XVIII",
        description: "Convert up to 2 runes to Shadow.",
        effect: { type: "convertElement", element: "shadow" },
        minTargets: 1, maxTargets: 2,
        fileBasename: "18_theMoon",
    },
    the_sun: {
        id: "the_sun",
        name: "The Sun",
        number: "XIX",
        description: "Convert up to 2 runes to Fire.",
        effect: { type: "convertElement", element: "fire" },
        minTargets: 1, maxTargets: 2,
        fileBasename: "19_theSun",
    },
    judgement: {
        id: "judgement",
        name: "Judgement",
        number: "XX",
        description: "Choose an element — every rune of that element in your pouch upgrades by 1 rarity tier.",
        effect: { type: "upgradeAllOfElement" },
        minTargets: 0, maxTargets: 0,
        requiresElement: true,
        fileBasename: "20_judgement",
    },
    the_world: {
        id: "the_world",
        name: "The World",
        number: "XXI",
        description: "Add 1 random Rare or Legendary rune to your pouch.",
        effect: { type: "addRandomRune", legendaryChance: 0.20 },
        minTargets: 0, maxTargets: 0,
        fileBasename: "21_theWorld",
    },
};

export const TAROT_IDS: readonly string[] = Object.keys(TAROT_DEFINITIONS);

export function getTarotDefinition(id: string): TarotDefinition | null {
    return TAROT_DEFINITIONS[id] ?? null;
}
