export {
    ArkynState,
    ArkynPlayerState,
    RuneInstance,
    EnemyState,
    ShopItemState,
} from "./ArkynState";

export {
    HAND_SIZE,
    MAX_PLAY,
    POUCH_SIZE,
    RUNES_PER_ELEMENT,
    CASTS_PER_ROUND,
    DISCARDS_PER_ROUND,
    ELEMENT_TYPES,
    RARITY_TYPES,
    SCROLL_COST,
    SCROLL_RUNE_BONUS,
    SHOP_SCROLL_COUNT,
    MAX_SIGILS,
    SHOP_SIGIL_COUNT,
    ARKYN_JOIN,
    ARKYN_CAST,
    ARKYN_DISCARD,
    ARKYN_READY,
    ARKYN_COLLECT_ROUND_GOLD,
    ARKYN_NEW_RUN,
    ARKYN_BUY_ITEM,
    ARKYN_SELL_SIGIL,
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
    SYNERGY_PAIRS,
    TWO_PAIR_TABLE,
    FULL_HOUSE_TABLE,
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

export { getEnemyForRound, getHpForRound } from "./enemyDefinitions";
export type { EnemyDefinition } from "./enemyDefinitions";

export { ENEMY_BANK } from "./enemyBank";
export type { EnemyTemplate } from "./enemyBank";

export { seededRandom, createRoundRng, generateRunSeed } from "./seededRandom";

export { generateShopScrolls, generateShopSigils } from "./shopGeneration";

export { SIGIL_DEFINITIONS, SIGIL_IDS } from "./sigils";
export type { SigilDefinition } from "./sigils";

export {
    SIGIL_STAT_MODIFIERS,
    SIGIL_PROCS,
    SIGIL_HAND_MULT,
    SIGIL_LIFECYCLE_HOOKS,
    getPlayerStatDeltas,
    getHandMultBonus,
    iterateProcs,
} from "./sigilEffects";
export type {
    PlayerStatDeltas,
    ProcEffect,
    ProcDefinition,
    ProcEvent,
    HandMultEffect,
    HandMultEntry,
    SigilLifecycleHooks,
} from "./sigilEffects";

export { BOSS_DEBUFFS, isBossRound, pickDebuffForRound, getDebuffById } from "./bossDebuffs";
export type { BossDebuff } from "./bossDebuffs";
