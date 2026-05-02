import {
    RARITY_TYPES,
    SIGIL_DEFINITIONS,
    SIGIL_IDS,
    SPELL_TIER_BASE_DAMAGE,
    SPELL_TIER_MULT,
    SYNERGY_PAIRS,
    TAROT_DEFINITIONS,
    TAROT_IDS,
} from "../../shared";

export type HowToPlayTab =
    | "basics"
    | "scoring"
    | "combat"
    | "items"
    | "sigils"
    | "packs"
    | "scrolls"
    | "tarots";

export interface HowToPlayTabEntry {
    id: HowToPlayTab;
    label: string;
    /** Optional parent — child tabs render indented in the sidebar
     *  (visual subcategory under the parent's heading). */
    parent?: HowToPlayTab;
}

export const HOW_TO_PLAY_TABS: HowToPlayTabEntry[] = [
    { id: "basics", label: "Basics" },
    { id: "scoring", label: "Scoring" },
    { id: "combat", label: "Combat" },
    { id: "items", label: "Items" },
    { id: "sigils", label: "Sigils", parent: "items" },
    { id: "packs", label: "Packs", parent: "items" },
    { id: "scrolls", label: "Scrolls", parent: "items" },
    { id: "tarots", label: "Tarots" },
];

// All default synergy pairs, sourced from `SYNERGY_PAIRS` in
// `shared/spellTable.ts` so this stays in sync with the actual cast
// resolver. Sigil-gated synergies (e.g. Burnrite's death+fire from
// `SIGIL_SYNERGY_PAIRS`) are intentionally excluded — those are
// rewards, not baseline knowledge.
export const ALL_SYNERGY_PAIRS: [string, string][] = Array.from(SYNERGY_PAIRS).map(
    key => key.split("+") as [string, string],
);

// Sigils sorted by rarity (Common → Legendary), then alphabetically by
// name within each rarity. Reads as a natural progression from the
// cheapest baseline sigils to the rarest endgame ones, instead of the
// arbitrary insertion order in `SIGIL_DEFINITIONS`.
const RARITY_ORDER: Record<string, number> = Object.fromEntries(
    RARITY_TYPES.map((r, i) => [r, i]),
);
export const SIGIL_ORDER: string[] = SIGIL_IDS.slice().sort((a, b) => {
    const da = SIGIL_DEFINITIONS[a];
    const db = SIGIL_DEFINITIONS[b];
    const ra = RARITY_ORDER[da.rarity] ?? 99;
    const rb = RARITY_ORDER[db.rarity] ?? 99;
    if (ra !== rb) return ra - rb;
    return da.name.localeCompare(db.name);
});

// Tier data — mirrors the Grimoire so any future change to spell tier
// values flows through both modals without manual sync.
export const TIER_DATA = [1, 2, 3, 4, 5].map(tier => ({
    tier,
    runes: tier,
    base: SPELL_TIER_BASE_DAMAGE[tier],
    mult: SPELL_TIER_MULT[tier],
}));

export const RARITY_BASE_DAMAGE: { rarity: string; base: number }[] = [
    { rarity: "common", base: 8 },
    { rarity: "uncommon", base: 12 },
    { rarity: "rare", base: 18 },
    { rarity: "legendary", base: 30 },
];

// Sorted by Major Arcana number so the grid reads 0 → XXI.
export const TAROT_ORDER: string[] = TAROT_IDS.slice().sort((a, b) => {
    const aNum = parseRoman(TAROT_DEFINITIONS[a].number);
    const bNum = parseRoman(TAROT_DEFINITIONS[b].number);
    return aNum - bNum;
});

// Convert a Roman-numeral or Arabic-digit string to a number for sorting
// the Major Arcana by their canonical order (0 → XXI). Tarot definitions
// use mixed forms ("0", "I", "II", "VIII", "XXI"), so a tiny parser keeps
// the sort stable without per-tarot ordinal fields.
function parseRoman(s: string): number {
    if (/^\d+$/.test(s)) return Number(s);
    const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 };
    let total = 0;
    for (let i = 0; i < s.length; i++) {
        const cur = map[s[i]] ?? 0;
        const next = map[s[i + 1]] ?? 0;
        total += cur < next ? -cur : cur;
    }
    return total;
}
