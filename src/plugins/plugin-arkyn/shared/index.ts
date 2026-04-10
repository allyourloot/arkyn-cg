export {
    ArkynState,
    ArkynPlayerState,
    RuneInstance,
    EnemyState,
} from "./ArkynState";

export {
    HAND_SIZE,
    MAX_PLAY,
    POUCH_SIZE,
    RUNES_PER_ELEMENT,
    ELEMENT_TYPES,
    RARITY_TYPES,
    ARKYN_JOIN,
    ARKYN_CAST,
    ARKYN_DISCARD,
    ARKYN_READY,
} from "./arkynConstants";

export type {
    ElementType,
    RarityType,
} from "./arkynConstants";

export {
    SPELL_TABLE,
    SPELL_TIER_BASE_DAMAGE,
    SPELL_TIER_MULT,
    RUNE_BASE_DAMAGE,
} from "./spellTable";
export type { SpellInfo } from "./spellTable";

export { resolveSpell, getContributingRuneIndices } from "./resolveSpell";
export type { ResolvedSpell, RuneData } from "./resolveSpell";

export {
    calculateDamage,
    calculateRuneDamageBreakdown,
    calculateSpellDamage,
} from "./calculateDamage";
export type { RuneDamageBreakdown, SpellDamageBreakdown } from "./calculateDamage";

export { SPELLBOOKS, DEFAULT_SPELLBOOK_ID } from "./spellbooks";
export type { SpellbookId, SpellbookDefinition } from "./spellbooks";
