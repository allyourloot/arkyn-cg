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
    COMBINABLE_ELEMENTS,
    RARITY_TYPES,
    ARKYN_JOIN,
    ARKYN_CAST,
    ARKYN_DISCARD,
    ARKYN_READY,
} from "./arkynConstants";

export type {
    ElementType,
    CombinableElement,
    RarityType,
} from "./arkynConstants";

export { SPELL_TABLE, COMBO_TABLE, TIER_MULTIPLIERS } from "./spellTable";
export type { SpellInfo } from "./spellTable";

export { resolveSpell, getContributingRuneIndices } from "./resolveSpell";
export type { ResolvedSpell, RuneData } from "./resolveSpell";

export { calculateDamage } from "./calculateDamage";
