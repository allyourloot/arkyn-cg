import { ELEMENT_TYPES, MAX_PLAY, MAX_SIGILS, type ElementType } from "./arkynConstants";

/**
 * Achievement registry. Pure data — server-side `evaluateAchievements`
 * iterates this list at every relevant trigger. To add a 26th
 * achievement, drop a new entry in `ACHIEVEMENT_DEFINITIONS` below.
 *
 * If the achievement gates a sigil, also add it to
 * `SIGIL_UNLOCK_REQUIREMENTS` at the bottom of this file.
 */

/** Trigger-class hint — the central evaluator filters predicates by this. */
export type AchievementTrigger =
    | "first_load"
    | "cast"
    | "discard"
    | "enemy_defeated"
    | "round_clear"
    | "run_end"
    | "pack_opened"
    | "sigil_acquired"
    | "sigil_sold";

/** Display category for the achievements modal grouping. */
export type AchievementCategory =
    | "onboarding"
    | "progress"
    | "feats"
    | "mastery";

/**
 * Snapshot of player state passed to every predicate. The evaluator
 * assembles this once per trigger and reuses across all definitions —
 * predicates are pure functions that read from the snapshot.
 */
export interface AchievementContext {
    /** What kind of game event prompted this evaluation pass. */
    trigger: AchievementTrigger;

    /** Lifetime save totals — null when save-states is unavailable (dev mode). */
    lifetime: {
        totalCasts: number;
        totalDiscards: number;
        totalRuns: number;
        totalEnemiesDefeated: number;
        totalGoldEarned: number;
        runePacksOpened: number;
        auguryPacksOpened: number;
        sigilsSold: number;
        elementsCast: Record<string, number>;
    } | null;

    /** Stats for the currently-active run (ephemeral, may be null between runs). */
    run: {
        roundReached: number;
        totalDamage: number;
        highestSingleCastDamage: number;
        enemiesDefeated: number;
        sigilsAcquiredThisRun: number;
        maxSigilsHeld: number;
        maxRunesPlayedInCast: number;
    } | null;

    /**
     * Latest cast-event payload — populated only when `trigger === "cast"`.
     * Predicates for "Cast a Tier 5 Death spell" etc. read from here.
     */
    cast: {
        damage: number;
        runeCount: number;
        spellTier: number;
        spellElement: string;
    } | null;

    /** Latest enemy-defeat payload — populated only when `trigger === "enemy_defeated"`. */
    enemyDefeat: {
        round: number;
        isBoss: boolean;
    } | null;

    /** Latest pack-opened payload — populated only when `trigger === "pack_opened"`. */
    pack: {
        kind: "rune" | "codex" | "augury";
    } | null;

    /** Currently-owned sigil count (used by full-bar achievement). */
    ownedSigilCount: number;
}

export interface AchievementDefinition {
    id: string;
    name: string;
    description: string;
    category: AchievementCategory;
    /** Predicate hint — only evaluate this rule when the trigger matches. */
    triggers: readonly AchievementTrigger[];
    /** Returns true when the player has just satisfied the requirement. */
    evaluate: (ctx: AchievementContext) => boolean;
    /** Sigil unlocked when this achievement completes (optional). */
    unlocksSigilId?: string;
    /**
     * Optional progress accessor — for cumulative achievements, returns
     * `[current, target]` so the modal can render a progress bar.
     * Undefined for one-shot achievements (binary lock/unlock).
     */
    progress?: (ctx: AchievementContext) => readonly [number, number];
}

// Numeric thresholds collected at the top so balance tweaks live in one place.
const THRESH = {
    DISCARDS_LIFETIME: 100,
    CASTS_LIFETIME: 500,
    ENEMIES_LIFETIME: 100,
    GOLD_LIFETIME: 5000,
    RUNS_LIFETIME: 10,
    AUGURY_PACKS_LIFETIME: 25,
    RUNE_PACKS_LIFETIME: 50,
    SIGILS_SOLD_LIFETIME: 25,
    BIG_HIT: 1_000,
    MASSIVE_HIT: 5_000,
    CATACLYSM: 25_000,
    DEEP_RUN_ROUND: 10,
    ENDGAME_ROUND: 15,
    BOSS_ROUND: 5,
} as const;

export const ACHIEVEMENT_DEFINITIONS: Record<string, AchievementDefinition> = {
    // ── Onboarding ──────────────────────────────────────────────────────
    first_cast: {
        id: "first_cast",
        name: "First Cast",
        description: "Cast your first spell.",
        category: "onboarding",
        triggers: ["cast", "first_load"],
        evaluate: ctx => (ctx.lifetime?.totalCasts ?? 0) >= 1,
    },
    first_rune_pack: {
        id: "first_rune_pack",
        name: "First Pack",
        description: "Open your first Rune Pack.",
        category: "onboarding",
        triggers: ["pack_opened", "first_load"],
        evaluate: ctx => (ctx.lifetime?.runePacksOpened ?? 0) >= 1,
    },
    first_sigil: {
        id: "first_sigil",
        name: "First Sigil",
        description: "Acquire your first sigil.",
        category: "onboarding",
        triggers: ["sigil_acquired", "first_load"],
        evaluate: ctx => (ctx.run?.sigilsAcquiredThisRun ?? 0) >= 1 || ctx.ownedSigilCount >= 1,
    },
    first_augury: {
        id: "first_augury",
        name: "First Augury",
        description: "Open your first Augury Pack.",
        category: "onboarding",
        triggers: ["pack_opened", "first_load"],
        evaluate: ctx => (ctx.lifetime?.auguryPacksOpened ?? 0) >= 1,
    },
    first_boss: {
        id: "first_boss",
        name: "Boss Slayer",
        description: `Defeat the Round ${THRESH.BOSS_ROUND} boss.`,
        category: "onboarding",
        triggers: ["enemy_defeated"],
        evaluate: ctx =>
            !!ctx.enemyDefeat &&
            ctx.enemyDefeat.isBoss &&
            ctx.enemyDefeat.round === THRESH.BOSS_ROUND,
    },

    // ── Progress (lifetime cumulative) ─────────────────────────────────
    spellslinger: {
        id: "spellslinger",
        name: "Spellslinger",
        description: `Cast ${THRESH.CASTS_LIFETIME} spells across all runs.`,
        category: "progress",
        triggers: ["cast", "first_load", "run_end"],
        evaluate: ctx => (ctx.lifetime?.totalCasts ?? 0) >= THRESH.CASTS_LIFETIME,
        progress: ctx => [ctx.lifetime?.totalCasts ?? 0, THRESH.CASTS_LIFETIME],
    },
    diviner: {
        id: "diviner",
        name: "Diviner",
        description: `Open ${THRESH.AUGURY_PACKS_LIFETIME} Augury Packs.`,
        category: "progress",
        triggers: ["pack_opened", "first_load"],
        evaluate: ctx => (ctx.lifetime?.auguryPacksOpened ?? 0) >= THRESH.AUGURY_PACKS_LIFETIME,
        progress: ctx => [ctx.lifetime?.auguryPacksOpened ?? 0, THRESH.AUGURY_PACKS_LIFETIME],
    },
    pouchsmith: {
        id: "pouchsmith",
        name: "Pouchsmith",
        description: `Open ${THRESH.RUNE_PACKS_LIFETIME} Rune Packs.`,
        category: "progress",
        triggers: ["pack_opened", "first_load"],
        evaluate: ctx => (ctx.lifetime?.runePacksOpened ?? 0) >= THRESH.RUNE_PACKS_LIFETIME,
        progress: ctx => [ctx.lifetime?.runePacksOpened ?? 0, THRESH.RUNE_PACKS_LIFETIME],
    },
    discard_master: {
        id: "discard_master",
        name: "Discard Master",
        description: `Use the Discard action ${THRESH.DISCARDS_LIFETIME} times across all runs.`,
        category: "progress",
        triggers: ["discard", "first_load", "run_end"],
        evaluate: ctx => (ctx.lifetime?.totalDiscards ?? 0) >= THRESH.DISCARDS_LIFETIME,
        progress: ctx => [ctx.lifetime?.totalDiscards ?? 0, THRESH.DISCARDS_LIFETIME],
    },
    slayer: {
        id: "slayer",
        name: "Slayer",
        description: `Defeat ${THRESH.ENEMIES_LIFETIME} enemies across all runs.`,
        category: "progress",
        triggers: ["enemy_defeated", "first_load", "run_end"],
        evaluate: ctx => (ctx.lifetime?.totalEnemiesDefeated ?? 0) >= THRESH.ENEMIES_LIFETIME,
        progress: ctx => [ctx.lifetime?.totalEnemiesDefeated ?? 0, THRESH.ENEMIES_LIFETIME],
    },
    wealthy: {
        id: "wealthy",
        name: "Wealthy",
        description: `Earn ${THRESH.GOLD_LIFETIME.toLocaleString()} gold across all runs.`,
        category: "progress",
        triggers: ["round_clear", "first_load", "run_end"],
        evaluate: ctx => (ctx.lifetime?.totalGoldEarned ?? 0) >= THRESH.GOLD_LIFETIME,
        progress: ctx => [ctx.lifetime?.totalGoldEarned ?? 0, THRESH.GOLD_LIFETIME],
    },
    veteran: {
        id: "veteran",
        name: "Veteran",
        description: `Complete ${THRESH.RUNS_LIFETIME} runs.`,
        category: "progress",
        triggers: ["run_end", "first_load"],
        evaluate: ctx => (ctx.lifetime?.totalRuns ?? 0) >= THRESH.RUNS_LIFETIME,
        progress: ctx => [ctx.lifetime?.totalRuns ?? 0, THRESH.RUNS_LIFETIME],
    },
    reseller: {
        id: "reseller",
        name: "Reseller",
        description: `Sell ${THRESH.SIGILS_SOLD_LIFETIME} sigils across all runs.`,
        category: "progress",
        triggers: ["sigil_sold", "first_load"],
        evaluate: ctx => (ctx.lifetime?.sigilsSold ?? 0) >= THRESH.SIGILS_SOLD_LIFETIME,
        progress: ctx => [ctx.lifetime?.sigilsSold ?? 0, THRESH.SIGILS_SOLD_LIFETIME],
    },

    // ── Feats (single-cast / single-run) ───────────────────────────────
    big_hit: {
        id: "big_hit",
        name: "Big Hit",
        description: `Cast a spell dealing ${THRESH.BIG_HIT.toLocaleString()}+ damage.`,
        category: "feats",
        triggers: ["cast"],
        evaluate: ctx => !!ctx.cast && ctx.cast.damage >= THRESH.BIG_HIT,
    },
    massive_hit: {
        id: "massive_hit",
        name: "Massive Hit",
        description: `Cast a spell dealing ${THRESH.MASSIVE_HIT.toLocaleString()}+ damage.`,
        category: "feats",
        triggers: ["cast"],
        evaluate: ctx => !!ctx.cast && ctx.cast.damage >= THRESH.MASSIVE_HIT,
    },
    cataclysm: {
        id: "cataclysm",
        name: "Cataclysm",
        description: `Cast a spell dealing ${THRESH.CATACLYSM.toLocaleString()}+ damage.`,
        category: "feats",
        triggers: ["cast"],
        evaluate: ctx => !!ctx.cast && ctx.cast.damage >= THRESH.CATACLYSM,
    },
    five_rune_spell: {
        id: "five_rune_spell",
        name: "Five-Rune Spell",
        description: `Cast a spell using all ${MAX_PLAY} runes at once.`,
        category: "feats",
        triggers: ["cast"],
        evaluate: ctx => !!ctx.cast && ctx.cast.runeCount >= MAX_PLAY,
    },
    full_bar: {
        id: "full_bar",
        name: "Full Bar",
        description: `Hold ${MAX_SIGILS} sigils at once.`,
        category: "feats",
        triggers: ["sigil_acquired"],
        evaluate: ctx => ctx.ownedSigilCount >= MAX_SIGILS,
    },
    deep_run: {
        id: "deep_run",
        name: "Deep Run",
        description: `Reach Round ${THRESH.DEEP_RUN_ROUND}.`,
        category: "feats",
        triggers: ["enemy_defeated", "run_end"],
        evaluate: ctx => (ctx.run?.roundReached ?? 0) >= THRESH.DEEP_RUN_ROUND,
    },
    endgame: {
        id: "endgame",
        name: "Endgame",
        description: `Reach Round ${THRESH.ENDGAME_ROUND}.`,
        category: "feats",
        triggers: ["enemy_defeated", "run_end"],
        evaluate: ctx => (ctx.run?.roundReached ?? 0) >= THRESH.ENDGAME_ROUND,
    },

    // ── Mastery (element / tier specific) ──────────────────────────────
    death_sentence: {
        id: "death_sentence",
        name: "Death Sentence",
        description: "Cast a Tier 5 Death spell.",
        category: "mastery",
        triggers: ["cast"],
        evaluate: ctx =>
            !!ctx.cast && ctx.cast.spellTier >= 5 && ctx.cast.spellElement === "death",
        unlocksSigilId: "blackjack",
    },
    inferno: {
        id: "inferno",
        name: "Inferno",
        description: "Cast a Tier 5 Fire spell.",
        category: "mastery",
        triggers: ["cast"],
        evaluate: ctx =>
            !!ctx.cast && ctx.cast.spellTier >= 5 && ctx.cast.spellElement === "fire",
    },
    arcane_master: {
        id: "arcane_master",
        name: "Arcane Master",
        description: "Cast a Tier 5 Arcane spell.",
        category: "mastery",
        triggers: ["cast"],
        evaluate: ctx =>
            !!ctx.cast && ctx.cast.spellTier >= 5 && ctx.cast.spellElement === "arcane",
    },
    element_scholar: {
        id: "element_scholar",
        name: "Element Scholar",
        description: `Cast a spell of every element type (${ELEMENT_TYPES.length}/${ELEMENT_TYPES.length}).`,
        category: "mastery",
        triggers: ["cast", "first_load"],
        evaluate: ctx => {
            const map = ctx.lifetime?.elementsCast;
            if (!map) return false;
            return ELEMENT_TYPES.every(el => (map[el] ?? 0) > 0);
        },
        progress: ctx => {
            const map = ctx.lifetime?.elementsCast ?? {};
            const have = ELEMENT_TYPES.reduce((n, el) => n + ((map[el] ?? 0) > 0 ? 1 : 0), 0);
            return [have, ELEMENT_TYPES.length];
        },
    },
    pure_run: {
        id: "pure_run",
        name: "Pure Run",
        description: `Reach Round ${THRESH.DEEP_RUN_ROUND} without ever holding a sigil this run.`,
        category: "mastery",
        triggers: ["enemy_defeated", "run_end"],
        evaluate: ctx =>
            (ctx.run?.roundReached ?? 0) >= THRESH.DEEP_RUN_ROUND &&
            (ctx.run?.maxSigilsHeld ?? 0) === 0,
    },
};

export const ACHIEVEMENT_IDS: readonly string[] = Object.keys(ACHIEVEMENT_DEFINITIONS);

/**
 * Sigil-gate map. A sigil id appearing here is hidden from the shop
 * pool until the player has unlocked the listed achievement. Sigils
 * absent from this map are always available.
 */
export const SIGIL_UNLOCK_REQUIREMENTS: Record<string, string> = {
    blackjack: "death_sentence",
};

/**
 * Returns true if this sigil is available in the shop given the
 * player's set of unlocked achievement ids.
 */
export function isSigilUnlocked(
    sigilId: string,
    unlockedAchievementIds: ReadonlySet<string>,
): boolean {
    const required = SIGIL_UNLOCK_REQUIREMENTS[sigilId];
    if (!required) return true;
    return unlockedAchievementIds.has(required);
}

/**
 * Element bitmask helpers — used to sync `elementsCast` to the client
 * compactly via a single number rather than 13 schema fields.
 */
export function elementsCastToBitmask(map: Record<string, number>): number {
    let mask = 0;
    ELEMENT_TYPES.forEach((el, i) => {
        if ((map[el] ?? 0) > 0) mask |= 1 << i;
    });
    return mask;
}

export function bitmaskHasElement(mask: number, el: ElementType): boolean {
    const i = ELEMENT_TYPES.indexOf(el);
    if (i < 0) return false;
    return (mask & (1 << i)) !== 0;
}
