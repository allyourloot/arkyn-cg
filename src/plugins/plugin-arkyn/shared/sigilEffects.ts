import { ARCANE_CLUSTER_ELEMENTS, ELEMENT_TYPES, type ElementType } from "./arkynConstants";
import { createRoundRng } from "./seededRandom";
import { SIGIL_DEFINITIONS } from "./sigils";
import {
    CAST_RNG_MULT_RNG_OFFSET_BASE,
    LIFECYCLE_RNG_OFFSET_BASE,
    PROC_RNG_OFFSET_BASE,
    SIGIL_RNG_OFFSET_SPACING,
    castRngMultRngSlot,
    lifecycleRngSlot,
    procRngSlot,
} from "./rngNamespace";

// Re-export so existing `from "./sigilEffects"` imports keep working.
export {
    PROC_RNG_OFFSET_BASE,
    LIFECYCLE_RNG_OFFSET_BASE,
    CAST_RNG_MULT_RNG_OFFSET_BASE,
    SIGIL_RNG_OFFSET_SPACING,
    procRngSlot,
    lifecycleRngSlot,
    castRngMultRngSlot,
};

/**
 * Sigil effect registries — data-driven tables that drive sigil behavior.
 *
 * Each category describes a common effect pattern (stat modifiers, RNG procs,
 * hand-based effects). Consumers iterate these registries generically
 * instead of branching on specific sigil IDs. Adding a new sigil of an
 * existing pattern = 1 data entry, zero code changes.
 *
 * Target pattern: `SIGIL_SYNERGY_PAIRS` in `spellTable.ts`, which already
 * powers Burnrite. This file extends the same approach to the other three
 * common categories (stat mods, procs, hand-mult) plus an escape hatch
 * for one-offs.
 */

// ============================================================================
// RNG Namespace Layout
// ============================================================================
//
// All RNG band-base constants and slot helpers live in `./rngNamespace.ts` —
// see that file for the full namespace map and the rationale behind the
// 10k-wide-band layout. The imports/re-exports above keep this file's API
// shape stable for existing call sites.

/** Width of a category's band — procs live in [300000, 400000). */
const SIGIL_RNG_BAND_WIDTH = 100000;

// ============================================================================
// Mimic — "Copies the effect of the sigil to the right"
// ============================================================================
//
// Every category helper below loops `sigils` and looks up a registry entry.
// Mimic plugs into that iteration with a single pure transform:
// `expandMimicSigils` walks player.sigils and — for each Mimic — appends
// the id of its right neighbor in its place, so the helper iterates the
// neighbor's registry entry twice (original + copy).
//
// Certain sigils can't be cleanly duplicated and are excluded from the
// copy. Each exclusion has a specific architectural or design reason:
//   - caster:      design choice — avoid stacking +casts from one slot
//   - voltage/hourglass/fortune: SIGIL_PROCS share an rngOffset across
//                  copies, so two iterations of the same proc produce
//                  identical rolls (deterministic but unintuitive).
//                  Chainlink is the exception — chance: 1 means every
//                  roll procs, so the RNG-sharing concern doesn't apply
//                  and Mimic+Chainlink cleanly stacks a second retrigger
//                  per rune on the final cast.
//   - burnrite/fuze/impale/haphazard: binary unlocks / set-membership —
//                  duplicating has no observable effect
//   - executioner: SIGIL_ACCUMULATOR_XMULT keys `player.sigilAccumulators`
//                  by sigil id, so a "second" executioner shares the same
//                  storage slot — can't carry a separate counter
//   - binoculars:  writes `player.disabledResistance` (single @type string
//                  field) — a second fire overwrites the first
//   - banish:      SIGIL_DISCARD_HOOKS dispatcher can't banish the same
//                  rune index twice safely in one pass
//   - mimic:       prevents `[mimic, mimic]` infinite chain / recursion
//
// Mimic-incompatible neighbors silently make Mimic a no-op. Mimic at the
// rightmost sigil slot (no neighbor) is likewise a no-op.

export const MIMIC_INCOMPATIBLE: ReadonlySet<string> = new Set([
    "caster",
    "voltage",
    "hourglass",
    "fortune",
    "blackjack",
    "burnrite",
    "fuze",
    "impale",
    "haphazard",
    "executioner",
    "binoculars",
    "banish",
    "boom_bomb",
    "big_bang",
    "mimic",
]);

export interface ExpandedMimicEntry {
    /** The effective sigil id to process at this position. */
    sigilId: string;
    /**
     * The original index this entry came from in `player.sigils`. For mimic
     * copies, this is the Mimic's slot, NOT the neighbor's — callers that
     * key state off position (future per-slot accumulators, hand bubbles)
     * can distinguish the copy's anchor from the original sigil's anchor.
     */
    sourceIndex: number;
    /** True if this entry was synthesized by a Mimic copying its neighbor. */
    isMimicCopy: boolean;
    /**
     * 0 for originals, 1 for a single Mimic copy. Lifecycle hooks use this
     * as an RNG seed jitter so deterministic rolls (Thief's scroll pick)
     * produce DIFFERENT results for the copy vs the original.
     */
    copyIndex: number;
}

/**
 * Walk `sigils` and produce an effective sigil list, expanding each Mimic
 * into its right-neighbor's id. Incompatible neighbors and Mimic at the
 * rightmost slot drop out (no-op). Detailed entries carry slot + copy
 * metadata for hook dispatchers that need it; most helpers just iterate
 * ids via `expandMimicSigils`.
 */
export function expandMimicSigilsDetailed(sigils: readonly string[]): ExpandedMimicEntry[] {
    const out: ExpandedMimicEntry[] = [];
    for (let i = 0; i < sigils.length; i++) {
        const id = sigils[i];
        if (id !== "mimic") {
            out.push({ sigilId: id, sourceIndex: i, isMimicCopy: false, copyIndex: 0 });
            continue;
        }
        const neighborId = sigils[i + 1];
        if (!neighborId) continue;
        if (MIMIC_INCOMPATIBLE.has(neighborId)) continue;
        out.push({ sigilId: neighborId, sourceIndex: i, isMimicCopy: true, copyIndex: 1 });
    }
    return out;
}

/**
 * Convenience wrapper over {@link expandMimicSigilsDetailed} that drops the
 * per-entry metadata and returns just the effective sigil id list. Most
 * category helpers (stat deltas, hand mult, played mult, xMult, resist
 * ignore, end-of-round gold) iterate ids only and use this form; the
 * detailed form is for dispatchers that need `sourceIndex` or `copyIndex`
 * (lifecycle hook rng jitter, discard-hook index tracking).
 */
export function expandMimicSigils(sigils: readonly string[]): string[] {
    return expandMimicSigilsDetailed(sigils).map(e => e.sigilId);
}

/**
 * Look up what sigil (if any) a given Mimic slot is currently copying.
 * Returns the neighbor's id when the neighbor is compatible, `null` when
 * Mimic at this slot is a no-op (no neighbor, or incompatible neighbor).
 * Used by the tooltip to show the live "Copying: [Neighbor]" hint.
 */
export function getMimicCopyTarget(
    sigils: readonly string[],
    mimicSlotIndex: number,
): string | null {
    if (sigils[mimicSlotIndex] !== "mimic") return null;
    const neighborId = sigils[mimicSlotIndex + 1];
    if (!neighborId) return null;
    if (MIMIC_INCOMPATIBLE.has(neighborId)) return null;
    return neighborId;
}

/**
 * Iterate effective owned sigils (Mimic-expanded) and invoke `fn` for each
 * one that has an entry in `registry`. Centralizes the iteration shell every
 * category helper repeats — "expand for Mimic, look up the registry entry,
 * skip sigils the category doesn't cover" — so a new registry-backed helper
 * is ~3 lines of category-specific body instead of a hand-rolled loop.
 *
 * Callers that need Mimic copy-metadata (sourceIndex / copyIndex — today the
 * lifecycle, discard, and cast-hook dispatchers) use `expandMimicSigilsDetailed`
 * directly and stay hand-rolled. Callers that iterate the RAW sigils list
 * (e.g. `applyAccumulatorIncrements`, where accumulator storage is keyed by
 * sigil id and Mimic expansion would double-update the same slot) also stay
 * hand-rolled.
 */
export function forEachOwnedSigil<T>(
    sigils: readonly string[],
    registry: Readonly<Record<string, T>>,
    fn: (entry: T, sigilId: string) => void,
): void {
    for (const sigilId of expandMimicSigils(sigils)) {
        const entry = registry[sigilId];
        if (entry === undefined) continue;
        fn(entry, sigilId);
    }
}

// ============================================================================
// Category 1 — Stat Modifiers (Caster pattern)
// ============================================================================

/**
 * Deltas applied to a player's per-round action budgets / hand size at the
 * start of each round. Multiple owned sigils stack additively.
 */
export interface PlayerStatDeltas {
    castsPerRound: number;
    discardsPerRound: number;
    handSize: number;
}

export const SIGIL_STAT_MODIFIERS: Record<string, Partial<PlayerStatDeltas>> = {
    caster: { castsPerRound: 1 },
    // Haphazard is a multi-category sigil: the resolver unlock + stat
    // penalty combo. -1 hand size is the trade-off for the easy access
    // to tier-N diverse casts — you see one fewer card per round, which
    // costs the player Two Pair / Full House / Tier-5 single-element
    // lookup reliability without making Abomination harder to trigger.
    haphazard: { handSize: -1 },
    // Big Bang is the Category 18 cumulative-xMult sigil. The -2 hand
    // size is the trade-off for factorial-scaling xMult at T5 — the
    // player HAS to commit to tier-5 hands to cash in, and the reduced
    // hand trims redraw depth so bricking a round is a real risk.
    big_bang: { handSize: -2 },
    orwyns_spellbook: { handSize: 2, castsPerRound: -1 },
};

/**
 * Sum all stat deltas across a player's owned sigils. Returns a zero'd
 * delta object if no sigils modify stats.
 */
export function getPlayerStatDeltas(sigils: readonly string[]): PlayerStatDeltas {
    const out: PlayerStatDeltas = { castsPerRound: 0, discardsPerRound: 0, handSize: 0 };
    forEachOwnedSigil(sigils, SIGIL_STAT_MODIFIERS, (delta) => {
        if (delta.castsPerRound) out.castsPerRound += delta.castsPerRound;
        if (delta.discardsPerRound) out.discardsPerRound += delta.discardsPerRound;
        if (delta.handSize) out.handSize += delta.handSize;
    });
    return out;
}

// ============================================================================
// Category 2 — RNG Procs on Played Runes (Voltage pattern)
// ============================================================================

/**
 * Effect applied when a proc fires. Discriminated union so new effect
 * types can be added without breaking existing callers.
 *
 * - `double_damage`: adds the rune's base contribution again (multiplied
 *   by the cast's final mult). Matches Voltage's original behavior.
 * - `grant_gold`: awards the player a flat amount of gold. The server
 *   applies it to `player.gold`; the client shows a floating "+N Gold"
 *   bubble over the procced rune. Does NOT contribute to cast damage.
 * - `execute`: guarantees the enemy dies by forcing the cast's total
 *   damage up to at least the enemy's current HP. No damage bubble
 *   (the execute isn't "extra damage" — it's a kill guarantee); the
 *   client layer plays a spritesheet + SFX to signal the proc instead.
 */
export type ProcEffect =
    | { type: "double_damage" }
    | { type: "grant_gold"; amount: number }
    | { type: "execute" };

export interface ProcDefinition {
    /** Element the proc checks for. `undefined` = any element triggers the roll. */
    element?: ElementType;
    /**
     * If true, the proc only rolls for runes that landed a critical hit
     * (rune element matched an enemy weakness). Independent of `element`
     * — a proc can require both, either, or neither.
     */
    requireCritical?: boolean;
    /**
     * If true, the proc only fires on the player's FINAL cast of the round
     * (castsRemaining === 1 pre-cast). Chainlink pattern — pair with
     * `chance: 1` for a deterministic "big finisher" retrigger on the last
     * hand. Stacks with other procs: a lightning rune on the final cast
     * with both Voltage and Chainlink owned can fire both procs in the
     * same cast.
     */
    requireFinalCast?: boolean;
    /**
     * If true, at most one rune in the cast procs — the first one in
     * contributing-rune order that passes the filters and rolls through.
     * Keychain pattern: "retrigger the FIRST played rune that critical hits."
     * Pair with `chance: 1` for a deterministic single-target proc.
     */
    firstMatchOnly?: boolean;
    /**
     * Number of proc events yielded per successful roll. Default `1` — one
     * roll, one yield. Keychain sets `retriggerCount: 2` so a single match
     * yields two `double_damage` events (the rune hits 3 total times: the
     * original + 2 retriggers). Gold / execute effects behave the same way
     * — N yields = N grants / N execute signals — but today only
     * double_damage uses `retriggerCount > 1`.
     */
    retriggerCount?: number;
    /** Proc chance, 0-1. */
    chance: number;
    /**
     * Unique RNG namespace offset. Each proc sigil must have its own offset
     * so deterministic RNG rolls don't collide across sigils. Validated at
     * module load below — duplicates throw.
     */
    rngOffset: number;
    /** What happens when the proc fires. */
    effect: ProcEffect;
}

export const SIGIL_PROCS: Record<string, ProcDefinition> = {
    voltage: {
        element: "lightning",
        chance: 0.25,
        rngOffset: procRngSlot(0),
        effect: { type: "double_damage" },
    },
    fortune: {
        requireCritical: true,
        chance: 1 / 3,
        rngOffset: procRngSlot(1),
        effect: { type: "grant_gold", amount: 2 },
    },
    hourglass: {
        // element omitted → any element triggers the roll
        chance: 0.25,
        rngOffset: procRngSlot(2),
        effect: { type: "double_damage" },
    },
    chainlink: {
        // Deterministic retrigger on the player's final cast of the round.
        // chance: 1 = always fires; requireFinalCast gates the whole proc so
        // it no-ops on casts 1..N-1. Element omitted → every contributing
        // rune retriggers, not just a specific element.
        requireFinalCast: true,
        chance: 1,
        rngOffset: procRngSlot(3),
        effect: { type: "double_damage" },
    },
    blackjack: {
        // 1-in-21 execute on any played Death rune. "21" is the Blackjack
        // target number — the gamble flavor of the sigil. The execute
        // effect forces totalDamage up to the enemy's current HP so the
        // kill is guaranteed (see calculateDamage). Client triggers a
        // spritesheet + SFX at the proc moment to signal the execute.
        element: "death",
        chance: 1 / 21,
        rngOffset: procRngSlot(4),
        effect: { type: "execute" },
    },
    keychain: {
        // Deterministic "first critical rune retriggers twice" proc. Like
        // Chainlink, chance: 1 means every eligible rune rolls through — the
        // `firstMatchOnly` flag then cuts the loop so only the first
        // critical rune (in cast order) procs. `retriggerCount: 2` yields
        // two double_damage events on that rune, so it lands 3 total hits.
        requireCritical: true,
        firstMatchOnly: true,
        retriggerCount: 2,
        chance: 1,
        rngOffset: procRngSlot(5),
        effect: { type: "double_damage" },
    },
};

/**
 * A single proc event — one rune rolled and procced. Server and client
 * both iterate the same generator to build identical proc sequences.
 */
export interface ProcEvent {
    /** Which sigil fired. */
    sigilId: string;
    /** Index into the contributing-rune array. */
    runeIdx: number;
    /** The proc effect to apply. */
    effect: ProcEffect;
}

/**
 * Iterate all proc events for a cast. Deterministic — server and client
 * produce identical sequences given the same inputs.
 *
 * Ordering: procs are yielded in `contributingRunes` index order, grouped
 * by sigil (outer loop is sigils, inner loop is runes). This matches the
 * legacy Voltage ordering.
 */
export function* iterateProcs(
    sigils: readonly string[],
    contributingRuneElements: readonly string[],
    runSeed: number,
    round: number,
    castNumber: number,
    /**
     * Optional per-rune crit flags, parallel to `contributingRuneElements`.
     * Required when any owned proc uses `requireCritical`. Callers that
     * never need crit-conditional procs may omit this.
     */
    isCritical?: readonly boolean[],
    /**
     * True if this cast consumes the player's final cast slot of the round
     * (castsRemaining === 1 pre-cast). Required when any owned proc uses
     * `requireFinalCast` (Chainlink). Default `false` — callers that don't
     * know the cast-budget can omit and final-cast procs stay dormant.
     */
    isFinalCast?: boolean,
): Generator<ProcEvent, void, unknown> {
    // Note: SIGIL_PROCS sigils are all in MIMIC_INCOMPATIBLE, so the
    // expansion here is a no-op in practice. Kept for consistency with
    // the other helpers and future-proofing if any proc-category sigil
    // later becomes Mimic-compatible.
    for (const sigilId of expandMimicSigils(sigils)) {
        const proc = SIGIL_PROCS[sigilId];
        if (!proc) continue;
        if (proc.requireFinalCast && !isFinalCast) continue;
        const rng = createRoundRng(runSeed, proc.rngOffset + round * 10 + castNumber);
        const yieldsPerHit = proc.retriggerCount ?? 1;
        for (let i = 0; i < contributingRuneElements.length; i++) {
            const element = contributingRuneElements[i];
            if (proc.element !== undefined && element !== proc.element) continue;
            if (proc.requireCritical && !isCritical?.[i]) continue;
            if (rng() < proc.chance) {
                for (let n = 0; n < yieldsPerHit; n++) {
                    yield { sigilId, runeIdx: i, effect: proc.effect };
                }
                // Keychain pattern: stop after the first matching rune so
                // only the earliest-in-cast-order rune procs. Without this
                // flag the loop continues and every matching rune rolls.
                if (proc.firstMatchOnly) break;
            }
        }
    }
}

// ============================================================================
// Category 3 — Hand-Based Mult (Synapse pattern)
// ============================================================================

export interface HandMultEffect {
    /** Element in the hand that triggers the mult bonus. */
    element: ElementType;
    /** Mult bonus per matching held rune. */
    multPerRune: number;
}

export const SIGIL_HAND_MULT: Record<string, HandMultEffect> = {
    synapse: { element: "psy", multPerRune: 2 },
};

/** Minimal rune shape the helper needs — accepts both server and client rune types. */
interface RuneLike {
    element: string;
}

/**
 * Per-sigil per-rune bubble entry. The client uses these to render hand
 * bubbles and tick the mult counter during the cast animation.
 */
export interface HandMultEntry {
    sigilId: string;
    handIndex: number;
    multDelta: number;
}

/**
 * Compute the total mult bonus from hand-based sigils + per-entry breakdown
 * for animation. Excluded indices (typically the selected/played runes)
 * don't count as "held."
 */
export function getHandMultBonus(
    sigils: readonly string[],
    hand: readonly RuneLike[],
    excludedIndices: ReadonlySet<number> | readonly number[],
): { total: number; perSigil: HandMultEntry[] } {
    const excluded = excludedIndices instanceof Set
        ? excludedIndices
        : new Set(excludedIndices);

    let total = 0;
    const perSigil: HandMultEntry[] = [];
    // Iterate originals BEFORE Mimic copies so each held rune's bubble
    // sequence reads as "sigil triggers, then Mimic echoes it" — clearer
    // cause/effect than the raw expansion order (which puts Mimic copies
    // at the Mimic's slot, BEFORE the original sigil). Combined with the
    // stable handIndex sort below, this produces a per-rune burst:
    // rune1: orig + mimic, rune2: orig + mimic, ...
    const expanded = expandMimicSigilsDetailed(sigils);
    const ordered = [
        ...expanded.filter(e => !e.isMimicCopy),
        ...expanded.filter(e => e.isMimicCopy),
    ];
    for (const exp of ordered) {
        const effect = SIGIL_HAND_MULT[exp.sigilId];
        if (!effect) continue;
        for (let i = 0; i < hand.length; i++) {
            if (excluded.has(i)) continue;
            const rune = hand[i];
            if (!rune || rune.element !== effect.element) continue;
            total += effect.multPerRune;
            perSigil.push({ sigilId: exp.sigilId, handIndex: i, multDelta: effect.multPerRune });
        }
    }
    perSigil.sort((a, b) => a.handIndex - b.handIndex);
    return { total, perSigil };
}

// ============================================================================
// Category 4 — Lifecycle Hooks (escape hatch for one-off effects)
// ============================================================================

/**
 * Opt-in hooks for sigils whose effect doesn't fit any common category.
 * Most sigils won't use this. Reserved for genuinely unique mechanics
 * (e.g. "after discarding, next cast deals double damage").
 *
 * Keep this sparse — if two sigils need the same hook, consider promoting
 * it to a proper category registry above.
 */

/**
 * Discriminated effects a lifecycle hook can request. The caller dispatches
 * over `type` — new effect kinds can be added without changing existing
 * hook contracts, and a single hook may return multiple effects in one
 * invocation (e.g. grant a consumable AND +1 gold in the same round-start).
 */
export type RoundStartEffect =
    | { type: "grantConsumable"; consumableId: string }
    | { type: "grantGold"; amount: number }
    | { type: "grantStat"; stat: "castsRemaining" | "discardsRemaining" | "handSize"; amount: number }
    | { type: "disableResistance"; element: string }
    | { type: "setAhoyElement"; element: string };

/**
 * Context passed to round-start lifecycle hooks. Carries the freshly-spawned
 * enemy's affinities so hooks can make decisions conditioned on the current
 * matchup (Binoculars picks one of the enemy's resistances to nullify).
 * Optional so existing hooks that don't need enemy data (Thief) can ignore it.
 *
 * `copyIndex` is 0 for the original sigil invocation and ≥1 for Mimic-
 * generated copies — seeded-RNG hooks (Thief) use it as a jitter so the
 * copy rolls a different result than the original. Non-RNG hooks ignore it.
 */
export interface RoundStartContext {
    readonly enemyResistances: readonly string[];
    readonly enemyWeaknesses: readonly string[];
    readonly copyIndex: number;
}

export interface SigilLifecycleHooks {
    /**
     * Fired once per player at the start of each round (after stat deltas
     * are applied, before the pouch is built). Return an array of effects
     * the caller will dispatch — or `void` / `[]` for no-op. Array form is
     * preferred: it keeps the contract uniform as new effect kinds land.
     */
    onRoundStart?(round: number, runSeed: number, ctx: RoundStartContext): readonly RoundStartEffect[] | void;
}

const THIEF_RNG_OFFSET = lifecycleRngSlot(0);
const BINOCULARS_RNG_OFFSET = lifecycleRngSlot(1);
const AHOY_RNG_OFFSET = lifecycleRngSlot(2);

export const SIGIL_LIFECYCLE_HOOKS: Record<string, SigilLifecycleHooks> = {
    thief: {
        onRoundStart(round, runSeed, ctx) {
            // `copyIndex * 1000` jitters the seed for Mimic-generated copies
            // so the copy picks a DIFFERENT scroll element than the original.
            // 1000 keeps the seed within the lifecycle RNG band (400000-
            // 499999) for any round < 1000, which is far beyond realistic
            // run lengths.
            const rng = createRoundRng(runSeed, THIEF_RNG_OFFSET + round + ctx.copyIndex * 1000);
            const element = ELEMENT_TYPES[Math.floor(rng() * ELEMENT_TYPES.length)];
            return [{ type: "grantConsumable", consumableId: element }];
        },
    },
    binoculars: {
        onRoundStart(round, runSeed, ctx) {
            // No-op if the enemy has no resistances to disable. Slot 1 (not 0)
            // avoids the latent rune-pack RNG collision documented at the top
            // of this file. Binoculars is Mimic-incompatible so `copyIndex`
            // is always 0 — kept in the seed for consistency.
            if (ctx.enemyResistances.length === 0) return [];
            const rng = createRoundRng(runSeed, BINOCULARS_RNG_OFFSET + round + ctx.copyIndex * 1000);
            const element = ctx.enemyResistances[Math.floor(rng() * ctx.enemyResistances.length)];
            return [{ type: "disableResistance", element }];
        },
    },
    ahoy: {
        onRoundStart(round, runSeed, ctx) {
            // Pick this round's "ahoy element" — discarding any rune of this
            // element during the round earns bonus gold via the discard hook
            // below. `copyIndex * 1000` jitters the seed so a Mimic copy
            // rolls a different element than the original (though only one
            // ahoy element survives on `player.ahoyDiscardElement` — the
            // last-processed hook wins, same one-slot pattern as Binoculars).
            const rng = createRoundRng(runSeed, AHOY_RNG_OFFSET + round + ctx.copyIndex * 1000);
            const element = ELEMENT_TYPES[Math.floor(rng() * ELEMENT_TYPES.length)];
            return [{ type: "setAhoyElement", element }];
        },
    },
};

// ============================================================================
// Category 5 — Resolver Feature Unlocks (boolean flags)
// ============================================================================

/**
 * Sigils that unlock loose-duo combo spells. When any owned sigil is in this
 * registry, casts with exactly 2 distinct combinable elements fire the
 * matching COMBO_TABLE spell instead of falling to single-element.
 */
export const SIGIL_LOOSE_DUO_UNLOCKS: Record<string, true> = {
    fuze: true,
};

export function looseDuosEnabled(sigils: readonly string[]): boolean {
    return expandMimicSigils(sigils).some(id => SIGIL_LOOSE_DUO_UNLOCKS[id]);
}

/**
 * Sigils that unlock the "all-unique runes → Abomination" resolver branch.
 * When any owned sigil is in this registry, casts with ≥ 2 played runes AND
 * every played rune being a distinct element fire the Haphazard branch in
 * `resolveSpell` (signature spell "Abomination", tier = rune count, all
 * played runes treated as contributing).
 */
export const SIGIL_ALL_UNIQUE_UNLOCKS: Record<string, true> = {
    haphazard: true,
};

export function allUniqueRunesEnabled(sigils: readonly string[]): boolean {
    return expandMimicSigils(sigils).some(id => SIGIL_ALL_UNIQUE_UNLOCKS[id]);
}

// ============================================================================
// Category 6 — Spell Element xMult (Supercell pattern)
// ============================================================================

/**
 * Multiplicative mult modifier conditioned on the spell's element(s). Unlike
 * hand-mult (Synapse), this doesn't depend on held runes — it fires whenever
 * the resolved spell involves one of the listed elements.
 *
 * Applied AFTER all additive mult bonuses (tier mult + hand-mult), so the
 * formula becomes:  `finalMult = (tierMult + additiveBonuses) × xMult`.
 * Multiple xMult sigils multiply together.
 */
export interface SpellXMultEffect {
    /** Elements that trigger this xMult. Spell must involve at least one. */
    elements: readonly ElementType[];
    /** Multiplicative factor applied to the final mult. */
    xMult: number;
}

export const SIGIL_SPELL_X_MULT: Record<string, SpellXMultEffect> = {
    supercell: { elements: ["lightning", "air"], xMult: 3 },
    eruption: { elements: ["fire", "earth"], xMult: 3 },
    zephyr: { elements: ["air"], xMult: 2 },
};

export interface SpellXMultEntry {
    sigilId: string;
    xMult: number;
}

/**
 * Compute the total multiplicative mult factor from spell-element xMult sigils.
 * Returns `total = 1` (identity) when no xMult applies. `entries` carries
 * per-sigil data for the animation layer (sigil shake + mult counter jump).
 *
 * @param spellElements - Elements involved in the resolved spell. For single-
 *   element spells, pass `[spell.element]`. For combos, pass `spell.comboElements`.
 */
export function getSpellXMult(
    sigils: readonly string[],
    spellElements: readonly string[],
): { total: number; entries: SpellXMultEntry[] } {
    let total = 1;
    const entries: SpellXMultEntry[] = [];
    forEachOwnedSigil(sigils, SIGIL_SPELL_X_MULT, (effect, sigilId) => {
        if (spellElements.some(e => (effect.elements as readonly string[]).includes(e))) {
            total *= effect.xMult;
            entries.push({ sigilId, xMult: effect.xMult });
        }
    });
    return { total, entries };
}

// ============================================================================
// Category 6.5 — Held-Element xMult (Clairvoyant pattern)
// ============================================================================

/**
 * Multiplicative mult bonus driven by runes HELD in the player's hand
 * (excluding the runes selected for the current cast). Mirrors
 * `SIGIL_HAND_MULT` (Synapse) structurally — element-gated, per-rune — but
 * applies multiplicatively to the xMult channel instead of additively to
 * bonusMult. Each matching held rune multiplies xMult by `xMultPerRune`.
 *
 * Visually, held-in-hand effects fire AFTER all played-hand damage events
 * (procs, played-mult, element-rune-bonus, per-rune cumulative xMult) so
 * the cast reads as: played damage settles → held bonuses tick → xMult
 * reveals → total counts up.
 */
export interface HeldXMultEffect {
    /** Element in the hand that triggers the xMult bonus. */
    element: ElementType;
    /** Multiplicative factor per matching held rune. */
    xMultPerRune: number;
}

export const SIGIL_HELD_X_MULT: Record<string, HeldXMultEffect> = {
    clairvoyant: { element: "psy", xMultPerRune: 1.5 },
};

/**
 * Per-sigil per-rune xMult entry. The client uses these to fire one xMult
 * reveal event per matching held rune in the held phase of the cast timeline.
 */
export interface HeldXMultEntry {
    sigilId: string;
    handIndex: number;
    xMultFactor: number;
}

/**
 * Compute the total multiplicative xMult factor from held-element xMult
 * sigils + per-entry breakdown for animation. Excluded indices (typically
 * the selected/played runes) don't count as "held." Returns `total = 1`
 * (identity) when no held xMult applies.
 */
export function getHeldXMult(
    sigils: readonly string[],
    hand: readonly RuneLike[],
    excludedIndices: ReadonlySet<number> | readonly number[],
): { total: number; entries: HeldXMultEntry[] } {
    const excluded = excludedIndices instanceof Set
        ? excludedIndices
        : new Set(excludedIndices);

    let total = 1;
    const entries: HeldXMultEntry[] = [];
    // Iterate originals BEFORE Mimic copies so each held rune's bubble
    // sequence reads as "sigil triggers, then Mimic echoes it" — clearer
    // cause/effect than the raw expansion order. Combined with the stable
    // handIndex sort below, this produces a per-rune burst:
    // rune1: orig + mimic, rune2: orig + mimic, ...
    const expanded = expandMimicSigilsDetailed(sigils);
    const ordered = [
        ...expanded.filter(e => !e.isMimicCopy),
        ...expanded.filter(e => e.isMimicCopy),
    ];
    for (const exp of ordered) {
        const effect = SIGIL_HELD_X_MULT[exp.sigilId];
        if (!effect) continue;
        for (let i = 0; i < hand.length; i++) {
            if (excluded.has(i)) continue;
            const rune = hand[i];
            if (!rune || rune.element !== effect.element) continue;
            total *= effect.xMultPerRune;
            entries.push({ sigilId: exp.sigilId, handIndex: i, xMultFactor: effect.xMultPerRune });
        }
    }
    entries.sort((a, b) => a.handIndex - b.handIndex);
    return { total, entries };
}

// ============================================================================
// Category 7 — Resistance Ignore (Impale pattern)
// ============================================================================

/**
 * Elements whose enemy-resistance is nullified while the sigil is owned.
 * When a sigil in this registry is active, the listed elements bypass the
 * enemy's resistance (×0.5) modifier — they hit for ×1.0 (neutral) instead.
 *
 * The UI consults `getIgnoredResistanceElements()` to overlay a red X on
 * the matching element chip in the enemy's Resists box, so the player can
 * see the nullification at a glance.
 *
 * Weaknesses are NOT affected — an enemy weak to Steel with Impale owned
 * still takes ×2.0 damage (weakness always wins).
 */
export const SIGIL_RESIST_IGNORE: Record<string, readonly ElementType[]> = {
    impale: ["steel"],
};

/**
 * Aggregate the set of elements whose enemy-resistances should be ignored
 * given the player's owned sigils. Multiple sigils stack: any element listed
 * by any owned sigil is ignored. Call at both the damage formula call sites
 * (to strip matching entries from the enemy's resistances before the
 * per-rune modifier lookup) and in the UI (to decide which chips to X out).
 *
 * `dynamicIgnored` merges in per-round dynamically-picked elements (today
 * just Binoculars' round-start pick, stored on `player.disabledResistance`).
 * Pass an empty string or omit when there is no dynamic selection. Mixing
 * the static registry with the dynamic selection at the aggregation layer
 * keeps all resist-ignore wiring downstream (damage formula + UI X overlay)
 * on a single code path.
 */
export function getIgnoredResistanceElements(
    sigils: readonly string[],
    dynamicIgnored?: string | readonly string[],
): Set<string> {
    const out = new Set<string>();
    forEachOwnedSigil(sigils, SIGIL_RESIST_IGNORE, (elements) => {
        for (const e of elements) out.add(e);
    });
    if (typeof dynamicIgnored === "string") {
        if (dynamicIgnored) out.add(dynamicIgnored);
    } else if (dynamicIgnored) {
        for (const e of dynamicIgnored) if (e) out.add(e);
    }
    return out;
}

// ============================================================================
// Category 8 — End-of-Round Gold (Plunder pattern)
// ============================================================================

/**
 * Flat gold granted when the player defeats the round's enemy. Unlike
 * Fortune-style proc gold (rolled per-cast, credited mid-animation), this
 * gold is staged on the killing blow and paid out alongside the base +
 * hands-bonus reward at the RoundEnd overlay's Total reveal.
 *
 * The RoundEnd overlay iterates owned sigils against this registry to
 * render one "<SigilName>..." row per matching sigil, just above the
 * Total line. Multiple sigils stack additively.
 */
export interface EndOfRoundGoldEffect {
    amount: number;
}

export const SIGIL_END_OF_ROUND_GOLD: Record<string, EndOfRoundGoldEffect> = {
    plunder: { amount: 5 },
};

export interface EndOfRoundGoldEntry {
    sigilId: string;
    amount: number;
}

/**
 * Compute the total end-of-round gold from all owned sigils + a per-sigil
 * breakdown for the RoundEnd overlay to animate one row per match. Returns
 * `total = 0, entries = []` when no owned sigil grants end-of-round gold.
 */
export function getEndOfRoundSigilGold(
    sigils: readonly string[],
): { total: number; entries: EndOfRoundGoldEntry[] } {
    let total = 0;
    const entries: EndOfRoundGoldEntry[] = [];
    forEachOwnedSigil(sigils, SIGIL_END_OF_ROUND_GOLD, (effect, sigilId) => {
        total += effect.amount;
        entries.push({ sigilId, amount: effect.amount });
    });
    return { total, entries };
}

// ============================================================================
// Category 9 — Played-Rune Mult (Arcana pattern)
// ============================================================================

/**
 * Additive mult bonus driven by runes PLAYED (contributing to the spell)
 * whose element is in the sigil's trigger set. Mirrors `SIGIL_HAND_MULT`
 * but fires on the cast's contributing runes instead of held-in-hand
 * runes — useful for sigils that reward "clustering" a group of elements
 * into a single cast.
 *
 * `elements` is a SET of trigger elements, not a single one, because most
 * natural-feeling sigils target a group (e.g. Arcana covers the whole
 * Arcane Cluster, not just the single "arcane" element).
 *
 * A contributing rune is one that actually drives damage for the resolved
 * spell (see `getContributingRuneIndices`), so Two-Pair kickers and
 * single-element non-primary runes don't count.
 */
export interface PlayedMultEffect {
    /** Played rune elements that trigger the mult bonus. */
    elements: readonly ElementType[];
    /** Mult bonus per matching played rune. */
    multPerRune: number;
}

export const SIGIL_PLAYED_MULT: Record<string, PlayedMultEffect> = {
    arcana: { elements: ARCANE_CLUSTER_ELEMENTS, multPerRune: 2 },
};

/**
 * Per-sigil per-rune entry — the animation layer uses these to tick the
 * Mult counter + shake the sigil once per matching played rune.
 */
export interface PlayedMultEntry {
    sigilId: string;
    /** Index into the CONTRIBUTING-runes array (not the full selection). */
    contributingRuneIdx: number;
    multDelta: number;
}

/**
 * Compute the total played-rune mult bonus + per-rune breakdown for the
 * animation. Returns `total = 0, perSigil = []` when no owned sigil
 * matches any played rune's element.
 */
export function getPlayedMultBonus(
    sigils: readonly string[],
    contributingRunes: readonly { element: string }[],
): { total: number; perSigil: PlayedMultEntry[] } {
    let total = 0;
    const perSigil: PlayedMultEntry[] = [];
    forEachOwnedSigil(sigils, SIGIL_PLAYED_MULT, (effect, sigilId) => {
        const triggers = effect.elements as readonly string[];
        for (let i = 0; i < contributingRunes.length; i++) {
            if (!triggers.includes(contributingRunes[i].element)) continue;
            total += effect.multPerRune;
            perSigil.push({ sigilId, contributingRuneIdx: i, multDelta: effect.multPerRune });
        }
    });
    return { total, perSigil };
}

// ============================================================================
// Category 10 — Element-Rune Bonus (Engine / Lex Divina pattern)
// ============================================================================

/**
 * Per-rune base + mult bonus applied to contributing runes whose element
 * matches the effect's filter. Optionally gated by CRITICAL hit (rune
 * element is in the enemy's weaknesses) — Lex Divina only fires on Holy
 * crits; Engine fires on every Steel rune. Both base and mult stack per
 * matching rune — 3 steel runes with Engine = +12 Base, +6 Mult.
 *
 * The base bonus is added POST-modifier: it's a flat +N on the rune's
 * final post-weakness/resist contribution, not pre-weakness. A "+4" in
 * the description reads as "+4 to the number that lands" rather than
 * compounding with ×2 weakness or ×0.5 resistance.
 */
export interface ElementRuneBonusEffect {
    /** Optional element filter. Omit to trigger on any matching rune. */
    elements?: readonly ElementType[];
    /** If true, the bonus only fires when the rune hit a weakness (crit). */
    requireCritical?: boolean;
    /** Flat base damage added per matching rune (post resist/weak mod). */
    baseBonus: number;
    /** Additive mult added per matching rune. Same channel as Arcana. */
    multBonus: number;
}

export const SIGIL_ELEMENT_RUNE_BONUS: Record<string, ElementRuneBonusEffect> = {
    lex_divina: { elements: ["holy"], requireCritical: true, baseBonus: 8, multBonus: 2 },
    engine: { elements: ["steel"], baseBonus: 4, multBonus: 2 },
    alkahest: { elements: ["poison", "arcane"], baseBonus: 10, multBonus: 4 },
    golem: { elements: ["earth"], baseBonus: 0, multBonus: 4 },
    gale: { elements: ["air"], baseBonus: 0, multBonus: 4 },
    shade: { elements: ["shadow"], baseBonus: 0, multBonus: 4 },
    stormfist: { elements: ["lightning"], baseBonus: 0, multBonus: 4 },
    cadaver: { elements: ["death"], baseBonus: 0, multBonus: 4 },
    metallurgy: { elements: ["steel"], baseBonus: 0, multBonus: 4 },
    mystique: { elements: ["arcane"], baseBonus: 0, multBonus: 4 },
    psychic: { elements: ["psy"], baseBonus: 0, multBonus: 4 },
    icicle: { elements: ["ice"], baseBonus: 0, multBonus: 4 },
    cyanide: { elements: ["poison"], baseBonus: 0, multBonus: 4 },
    angelic: { elements: ["holy"], baseBonus: 0, multBonus: 4 },
    fireball: { elements: ["fire"], baseBonus: 0, multBonus: 4 },
    tidal_wave: { elements: ["water"], baseBonus: 0, multBonus: 4 },
};

/**
 * Per-sigil per-rune trigger entry. Animation layer uses these to emit
 * `isMultTick` events interleaved after the parent rune's damage bubble,
 * so the Mult counter ticks + the triggering sigil shakes generically.
 */
export interface ElementRuneBonusEntry {
    sigilId: string;
    /** Index into the CONTRIBUTING-runes array. */
    contributingRuneIdx: number;
    baseDelta: number;
    multDelta: number;
}

/**
 * Walk owned element-rune-bonus sigils, check each contributing rune against
 * the element filter + optional crit gate, and emit per-rune base deltas
 * + a running mult total.
 *
 * @param isCritical - parallel to `contributingRuneElements`. `true` = rune's
 *   element is in the enemy's weaknesses (same definition as the damage
 *   formula's `breakdown.isCritical`). Only consulted when a sigil sets
 *   `requireCritical: true`.
 * @returns `perRuneBase[i]` is the total base bonus across all owned sigils
 *   for the i-th contributing rune; `totalMult` is the sum of per-rune mult
 *   deltas across all triggers; `entries` lists each (sigil × rune) trigger
 *   for the animation layer.
 */
export function getElementRuneBonus(
    sigils: readonly string[],
    contributingRuneElements: readonly string[],
    isCritical: readonly boolean[],
): { totalMult: number; perRuneBase: number[]; entries: ElementRuneBonusEntry[] } {
    const perRuneBase = new Array(contributingRuneElements.length).fill(0);
    let totalMult = 0;
    const entries: ElementRuneBonusEntry[] = [];
    forEachOwnedSigil(sigils, SIGIL_ELEMENT_RUNE_BONUS, (effect, sigilId) => {
        const elementFilter = effect.elements as readonly string[] | undefined;
        for (let i = 0; i < contributingRuneElements.length; i++) {
            if (effect.requireCritical && !isCritical[i]) continue;
            if (elementFilter !== undefined && !elementFilter.includes(contributingRuneElements[i])) continue;
            perRuneBase[i] += effect.baseBonus;
            totalMult += effect.multBonus;
            entries.push({
                sigilId,
                contributingRuneIdx: i,
                baseDelta: effect.baseBonus,
                multDelta: effect.multBonus,
            });
        }
    });
    return { totalMult, perRuneBase, entries };
}

// ============================================================================
// Category 12 — Accumulator xMult (Executioner pattern)
// ============================================================================

/**
 * Sigils whose xMult factor is read from a persistent per-player accumulator
 * field that grows as the player triggers specific in-game events. The
 * accumulator persists across rounds within a run and resets on a fresh run.
 *
 * Storage: `ArkynPlayerState.sigilAccumulators` (MapSchema<string, number>)
 * keyed by sigil ID. Missing keys fall back to the definition's
 * `initialValue` so newly-acquired sigils behave correctly before the first
 * increment.
 *
 * Timing: the pre-cast accumulator value applies to the CURRENT cast as an
 * xMult factor. After the cast resolves, the server increments the
 * accumulator by `perEventDelta × eventCount` — so the current cast's
 * crits feed future casts. The client reads the same pre-cast value via
 * schema sync so server/client animation stay in lockstep.
 */
export type AccumulatorTrigger = "criticalHit";

export interface AccumulatorXMultDefinition {
    /** What game event feeds the accumulator. */
    trigger: AccumulatorTrigger;
    /** How much the accumulator grows per trigger event (e.g. 0.2 per crit). */
    perEventDelta: number;
    /** Starting xMult when the sigil is newly acquired. 1 = neutral. */
    initialValue: number;
}

export const SIGIL_ACCUMULATOR_XMULT: Record<string, AccumulatorXMultDefinition> = {
    executioner: { trigger: "criticalHit", perEventDelta: 0.1, initialValue: 1.0 },
};

export interface AccumulatorXMultEntry {
    sigilId: string;
    xMult: number;
}

/**
 * Multiplicative xMult factor contributed by owned accumulator-driven sigils.
 * Entries are for the animation layer (sigil shake + xMult ticks); the total
 * stacks with Category 6's static xMult entries inside
 * `composeCastModifiers`. Neutral (1.0) accumulators are filtered so the
 * cast animation doesn't fire a no-op xMult reveal for freshly-bought
 * sigils with no crits built up yet.
 */
export function getAccumulatorXMult(
    sigils: readonly string[],
    accumulators: Readonly<Record<string, number>>,
): { total: number; entries: AccumulatorXMultEntry[] } {
    let total = 1;
    const entries: AccumulatorXMultEntry[] = [];
    // Note: Executioner (the only accumulator sigil today) is in
    // MIMIC_INCOMPATIBLE, so Mimic never duplicates accumulator reads.
    // Future accumulator sigils that ARE Mimic-compatible would re-read
    // the same `accumulators[sigilId]` value twice — acceptable and
    // matches the "copy the effect" intent.
    forEachOwnedSigil(sigils, SIGIL_ACCUMULATOR_XMULT, (def, sigilId) => {
        const value = accumulators[sigilId] ?? def.initialValue;
        if (value === 1) return;
        total *= value;
        entries.push({ sigilId, xMult: value });
    });
    return { total, entries };
}

/**
 * Given the counts of trigger events that fired during a cast, compute the
 * updated accumulator values for each owned accumulator sigil. Server calls
 * this after resolving a cast and patches the updates into
 * `player.sigilAccumulators`. Returned map only includes sigils whose
 * accumulators actually changed.
 */
export function applyAccumulatorIncrements(
    sigils: readonly string[],
    accumulators: Readonly<Record<string, number>>,
    eventCounts: Readonly<Partial<Record<AccumulatorTrigger, number>>>,
): Record<string, number> {
    const updates: Record<string, number> = {};
    for (const sigilId of sigils) {
        const def = SIGIL_ACCUMULATOR_XMULT[sigilId];
        if (!def) continue;
        const count = eventCounts[def.trigger] ?? 0;
        if (count <= 0) continue;
        const current = accumulators[sigilId] ?? def.initialValue;
        updates[sigilId] = current + count * def.perEventDelta;
    }
    return updates;
}

// ============================================================================
// Category 11 — Scroll Level Bonus (Scroll God pattern)
// ============================================================================

/**
 * Extra scroll levels granted per scroll use. When a player uses a scroll
 * (shop purchase or scroll consumable), they gain `1 + Σ(bonus)` levels on
 * the matching element's scroll counter. Multiple sigils stack additively.
 *
 * Consumers (shop handler, consumable handler, upgrade animation) all call
 * `getScrollLevelsPerUse(sigils)` — single source of truth so server and
 * client agree on how many levels a scroll grants.
 */
export const SIGIL_SCROLL_LEVEL_BONUS: Record<string, number> = {
    scroll_god: 1,
};

/**
 * Returns the number of scroll levels granted per scroll use, including
 * the base +1 level. `1` when no owned sigil boosts scrolls.
 */
export function getScrollLevelsPerUse(sigils: readonly string[]): number {
    let bonus = 0;
    forEachOwnedSigil(sigils, SIGIL_SCROLL_LEVEL_BONUS, (extra) => {
        bonus += extra;
    });
    return 1 + bonus;
}

// ============================================================================
// Category 13 — Flat / Inventory-Derived Additive Mult (Elixir / Spellcaster)
// ============================================================================

/**
 * Additive mult bonus computed once per cast from the player's sigil
 * inventory context — NOT from held/played runes, not from cast events.
 * Fires once per cast as a single flat bonus per owned sigil.
 *
 * `compute` receives the full owned-sigils list (including the sigil whose
 * effect is being evaluated) so the implementation can look up any
 * SigilDefinition field (sellPrice, cost, rarity, …). Implementations that
 * don't depend on inventory simply ignore the argument and return a
 * constant — that covers the "flat +N Mult" pattern (Spellcaster) without a
 * separate category. Keep `compute` pure and cheap: server and client both
 * call this on every cast.
 */
export interface InventoryMultDefinition {
    compute(sigils: readonly string[]): number;
}

export const SIGIL_INVENTORY_MULT: Record<string, InventoryMultDefinition> = {
    elixir: {
        compute: (sigils) => {
            let total = 0;
            for (const id of sigils) {
                const def = SIGIL_DEFINITIONS[id];
                if (def) total += def.sellPrice;
            }
            return total;
        },
    },
    spellcaster: {
        // Flat +5 Mult per cast — inventory argument ignored.
        compute: () => 5,
    },
};

/**
 * Per-sigil entry fed to the animation layer. One `isMultTick` event per
 * owned inventory-mult sigil per cast — no rune correlation, so this isn't
 * a per-rune tick like Arcana's.
 */
export interface InventoryMultEntry {
    sigilId: string;
    multDelta: number;
}

/**
 * Aggregate the flat inventory-mult bonus across all owned inventory-mult
 * sigils. Server uses `total`; client uses `entries` to pop one mult-counter
 * tick + sigil shake per contributing sigil during the cast animation.
 * Zero-delta entries (e.g. future effects that could evaluate to 0 for an
 * edge-case inventory) are filtered so the animation doesn't stall on a
 * no-op tick.
 */
export function getInventoryMultBonus(
    sigils: readonly string[],
): { total: number; entries: InventoryMultEntry[] } {
    let total = 0;
    const entries: InventoryMultEntry[] = [];
    // `compute` receives the RAW sigils array (not the expanded one) so
    // Elixir's sum-of-sellPrices isn't inflated by Mimic copies — a Mimic
    // that copies Elixir adds one additional Elixir evaluation, NOT a
    // doubled sellPrice sum inside a single evaluation.
    forEachOwnedSigil(sigils, SIGIL_INVENTORY_MULT, (def, sigilId) => {
        const delta = def.compute(sigils);
        if (delta === 0) return;
        total += delta;
        entries.push({ sigilId, multDelta: delta });
    });
    return { total, entries };
}

// ============================================================================
// Category 17 — Cast-RNG Mult (Boom Bomb pattern)
// ============================================================================

/**
 * Once-per-cast additive mult bonus rolled from a fixed set of possible
 * values. Unlike Category 13 (Inventory Mult) which is deterministic from
 * the sigil inventory, this category rolls a deterministic-but-random pick
 * from `values` using an RNG seeded by `(runSeed, round, castNumber)`, so
 * server and client always agree on the rolled face.
 *
 * Feeds the additive `bonusMult` channel like Category 13 / Arcana /
 * hand-mult: `finalMult = (tierMult + bonusMult) × xMult`. One
 * `isMultTick` event per owned sigil per cast (no per-rune correlation).
 * Roll a 0 and the entry is filtered so the animation doesn't stall on a
 * no-op tick — the sigil itself still exists but "fizzles" that cast.
 */
export interface CastRngMultEffect {
    /**
     * Pool of possible mult deltas. One is picked uniformly at random per
     * cast. A 0 entry is valid — it means "fizzle" (see `getCastRngMultBonus`
     * — zero rolls are filtered from the breakdown entries).
     */
    values: readonly number[];
    /**
     * Unique RNG namespace offset. Each cast-rng-mult sigil must have its
     * own slot so deterministic rolls don't collide with other sigils'
     * streams. Validated at module load below — duplicates throw.
     */
    rngOffset: number;
}

export const SIGIL_CAST_RNG_MULT: Record<string, CastRngMultEffect> = {
    boom_bomb: { values: [0, 2, 4, 8, 16], rngOffset: castRngMultRngSlot(0) },
};

export interface CastRngMultEntry {
    sigilId: string;
    multDelta: number;
}

/**
 * Roll the per-cast mult bonus for every cast-rng-mult sigil the player owns.
 * The seed is `runSeed ⊕ rngOffset + round * 10 + castNumber` — identical to
 * the proc seed scheme — so server and client produce the same face given
 * the same cast inputs. Zero-value rolls are dropped so the animation layer
 * doesn't emit a no-op tick.
 */
export function getCastRngMultBonus(
    sigils: readonly string[],
    runSeed: number,
    round: number,
    castNumber: number,
): { total: number; entries: CastRngMultEntry[] } {
    let total = 0;
    const entries: CastRngMultEntry[] = [];
    // All entries in SIGIL_CAST_RNG_MULT should also be in MIMIC_INCOMPATIBLE
    // (see the note above MIMIC_INCOMPATIBLE: RNG-sharing copies roll identical
    // faces). forEachOwnedSigil still Mimic-expands for contract uniformity
    // with the other helpers, so a future cast-rng-mult sigil made mimic-
    // compatible via a copyIndex jitter would wire in without changing this
    // helper.
    forEachOwnedSigil(sigils, SIGIL_CAST_RNG_MULT, (effect, sigilId) => {
        const rng = createRoundRng(runSeed, effect.rngOffset + round * 10 + castNumber);
        const value = effect.values[Math.floor(rng() * effect.values.length)];
        if (!value) return;
        total += value;
        entries.push({ sigilId, multDelta: value });
    });
    return { total, entries };
}

// ============================================================================
// Category 16 — Spell-Tier Mult (Tectonic pattern)
// ============================================================================

/**
 * Additive mult bonus gated by the resolved spell's tier. Unlike element-
 * xMult (Supercell) which conditions on the spell's element, this conditions
 * on the spell's tier — so a "+10 Mult on Tier IV spells" sigil fires for
 * every Tier 4 resolver outcome (Two Pair combos, 4-of-a-kind single-element,
 * Abomination on a 4-unique hand) regardless of element.
 *
 * Feeds the additive `bonusMult` channel alongside hand-mult / played-mult /
 * element-rune-bonus / inventory-mult — `finalMult = (tierMult + bonusMult) × xMult`.
 * One `isMultTick` event per owned matching sigil per cast, no per-rune
 * correlation (similar to inventory-mult).
 */
export interface SpellTierMultEffect {
    /** The resolved spell tier that triggers this bonus. */
    tier: number;
    /** Additive mult bonus applied when the tier matches. */
    mult: number;
}

export const SIGIL_SPELL_TIER_MULT: Record<string, SpellTierMultEffect> = {
    tectonic: { tier: 4, mult: 10 },
};

export interface SpellTierMultEntry {
    sigilId: string;
    multDelta: number;
}

/**
 * Compute the total additive mult bonus from spell-tier-matching sigils +
 * per-sigil breakdown for the animation. Returns `total = 0, entries = []`
 * when no owned sigil targets this spell's tier (or when `spellTier === 0`,
 * which means the cast didn't resolve to a scoring spell).
 */
export function getSpellTierMultBonus(
    sigils: readonly string[],
    spellTier: number,
): { total: number; entries: SpellTierMultEntry[] } {
    let total = 0;
    const entries: SpellTierMultEntry[] = [];
    if (spellTier <= 0) return { total, entries };
    forEachOwnedSigil(sigils, SIGIL_SPELL_TIER_MULT, (effect, sigilId) => {
        if (effect.tier !== spellTier) return;
        total += effect.mult;
        entries.push({ sigilId, multDelta: effect.mult });
    });
    return { total, entries };
}

// ============================================================================
// Category 14 — Discard Hooks (Banish pattern)
// ============================================================================

/**
 * Sigils that react when the player discards. Dispatched by `handleDiscard`
 * after validation succeeds but BEFORE the runes are removed from the hand,
 * so hooks can inspect the discarded runes and request effects (destroy one
 * permanently, grant gold, etc.). The caller walks the returned effect
 * array and dispatches each `DiscardEffect` over its `type` — new effect
 * kinds add as switch arms in the dispatcher.
 *
 * Today this is Banish ("destroy the rune + gain gold on a solo first
 * discard"); the plumbing is generic so future sigils (e.g. "every 3rd
 * discard grants +2 Gold", "discarding ≥3 runes adds +1 Mult next cast")
 * slot in as single data entries.
 */

export interface DiscardContext {
    /** 1-indexed: 1 = first discard of round, 2 = second, ... */
    readonly discardNumber: number;
    /** How many runes were in this discard. */
    readonly runeCount: number;
    /** The runes being discarded, in hand-index order. */
    readonly runes: readonly {
        id: string;
        element: string;
        rarity: string;
        level: number;
    }[];
    /**
     * The element Ahoy rolled for this round (empty string if Ahoy isn't
     * owned or hasn't rolled yet). Plumbed through the ctx rather than
     * read from player state inside the hook so server + client preview
     * share the same inputs.
     */
    readonly ahoyElement: string;
}

/**
 * Discriminated effects a discard hook can request. `banishRune` references
 * the rune by its index into `ctx.runes` so the hook can target a specific
 * discarded rune (today always 0, since Banish only activates on solo
 * discards).
 */
export type DiscardEffect =
    | { type: "banishRune"; runeIndex: number }
    | { type: "grantGold"; amount: number };

export interface DiscardHookDefinition {
    onDiscard(ctx: DiscardContext): readonly DiscardEffect[] | void;
}

export const SIGIL_DISCARD_HOOKS: Record<string, DiscardHookDefinition> = {
    banish: {
        onDiscard(ctx) {
            // Only fires on the FIRST discard of the round AND only when
            // the player discarded exactly one rune. This is the deckbuilding
            // gate: trades one discard "slot" for a permanent rune removal.
            if (ctx.discardNumber !== 1) return [];
            if (ctx.runeCount !== 1) return [];
            return [
                { type: "banishRune", runeIndex: 0 },
                { type: "grantGold", amount: 4 },
            ];
        },
    },
    ahoy: {
        onDiscard(ctx) {
            // 5g per discarded rune matching this round's ahoy element. The
            // element is rolled by the lifecycle hook above and plumbed
            // through ctx so server + client preview see identical inputs.
            // Mimic-compatible: a mimic-copied ahoy re-runs this hook, so
            // the same element pays out twice per matching rune.
            if (!ctx.ahoyElement) return [];
            let matches = 0;
            for (const rune of ctx.runes) {
                if (rune.element === ctx.ahoyElement) matches++;
            }
            if (matches === 0) return [];
            return [{ type: "grantGold", amount: 5 * matches }];
        },
    },
};

// ============================================================================
// Category 15 — Cast Hooks (Magic Mirror pattern)
// ============================================================================

/**
 * Sigils that react when the player casts. Dispatched by `handleCast`
 * AFTER the played runes are removed from the hand but BEFORE
 * `refillHand` runs. The hook's effects (Magic Mirror's `duplicateRune`)
 * push a rune into the hand to fill the slot the played rune vacated,
 * so `refillHand` — which tops up until `hand.length >= handSize` —
 * no-ops on that proc and NO extra pouch rune is drawn. The played
 * rune is effectively "swapped" for its mirror copy; the hand stays at
 * `handSize` and the pouch is preserved.
 *
 * The duplicate is ALSO pushed to `acquiredRunes` as a permanent deck
 * addition (same path Rune Pack picks take), so next round's
 * `createPouch` rebuilds the pool with the duplicate in it — enabling
 * the "duplicate a rune to build your Fire deck" loop Magic Mirror is
 * designed around.
 *
 * Held-mult sigils (Synapse, Clairvoyant) DO count the predicted
 * duplicate for the CURRENT cast — `composeCastModifiers` calls
 * `predictCastHookDuplicates` and feeds the predicted runes into the
 * held-mult/held-xMult helpers as virtual held entries. This makes
 * MM+Mimic+Clairvoyant feel "live": casting a solo Psy with MM+Mimic
 * predicts 2 Psy duplicates → Clairvoyant multiplies xMult by 1.5 × 1.5
 * = 2.25 for those duplicates on the cast that creates them. The
 * predicted dups land at virtual indices `hand.length + i`, matching
 * where `appendHandRune` lands them at fly-complete during the cast
 * animation, so the held-mult bubble overlay positions correctly.
 *
 * Hooks are pure predicates over the cast context — server and client
 * run them with the same inputs and produce the same effects, so the
 * client can preview the proc at fly-complete without waiting on the
 * server echo (see `castSpell` in arkynAnimations.ts).
 *
 * This is the cast-side analog of `SIGIL_DISCARD_HOOKS`; the two
 * categories share the same "first action → special effect" shape and
 * can be extended independently (e.g. a future "every 3rd cast grants
 * +2 Mult" sigil would slot in here with a new effect arm).
 */

export interface CastContext {
    /** 1-indexed: 1 = first cast of round, 2 = second, ... */
    readonly castNumber: number;
    /** How many runes contributed to this cast (selection length). */
    readonly runeCount: number;
    /** The runes played this cast, in hand-index order. */
    readonly runes: readonly {
        id: string;
        element: string;
        rarity: string;
        level: number;
    }[];
}

/**
 * Discriminated effects a cast hook can request. `duplicateRune` points
 * at a specific played rune by index into `ctx.runes` — the caller
 * creates a fresh RuneInstance with the same element/rarity/level and
 * appends it to the player's hand.
 */
export type CastEffect =
    | { type: "duplicateRune"; runeIndex: number };

export interface CastHookDefinition {
    onCast(ctx: CastContext): readonly CastEffect[] | void;
}

export const SIGIL_CAST_HOOKS: Record<string, CastHookDefinition> = {
    magic_mirror: {
        onCast(ctx) {
            // Only fires on the FIRST cast of the round AND only when the
            // player played exactly one rune — mirrors Banish's "first solo
            // discard" gate. The hand grows by +1 after the duplicate is
            // appended post-refill.
            if (ctx.castNumber !== 1) return [];
            if (ctx.runeCount !== 1) return [];
            return [{ type: "duplicateRune", runeIndex: 0 }];
        },
    },
};

/**
 * Predict the runes that SIGIL_CAST_HOOKS would push into the hand for a
 * given cast — used by `composeCastModifiers` to feed those runes into
 * held-mult/held-xMult calculations BEFORE the cast hooks actually fire.
 *
 * The hooks themselves run server-side AFTER damage calc, so without this
 * prediction Synapse/Clairvoyant would miss the duplicate on the cast
 * that creates it. With prediction, Magic Mirror + Clairvoyant feels
 * "live": casting a solo Psy with MM+Mimic produces 2 predicted Psy
 * duplicates, and Clairvoyant multiplies the cast's xMult by 1.5 × 1.5
 * for those duplicates.
 *
 * Returns runes in the SAME ORDER cast hooks fire (Mimic-expanded), so
 * appending them to `hand` produces effective indices that match where
 * `appendHandRune` lands the duplicates client-side during the cast
 * animation. Server and client must call this with identical inputs to
 * stay byte-for-byte consistent.
 */
export function predictCastHookDuplicates(
    sigils: readonly string[],
    castContext: CastContext,
): { element: string; rarity: string; level: number }[] {
    const predicted: { element: string; rarity: string; level: number }[] = [];
    for (const entry of expandMimicSigilsDetailed(sigils)) {
        const hook = SIGIL_CAST_HOOKS[entry.sigilId];
        if (!hook?.onCast) continue;
        const effects = hook.onCast(castContext);
        if (!effects) continue;
        for (const effect of effects) {
            if (effect.type !== "duplicateRune") continue;
            const source = castContext.runes[effect.runeIndex];
            if (!source) continue;
            predicted.push({
                element: source.element,
                rarity: source.rarity,
                level: source.level,
            });
        }
    }
    return predicted;
}

// ============================================================================
// Category 18 — Cumulative Cast xMult (Big Bang pattern)
// ============================================================================

/**
 * Multiplicative xMult ramp that fires ONCE PER CONTRIBUTING RUNE in cast
 * order. Rune N contributes `startFactor + stepDelta × N` to the running
 * xMult, so Big Bang's config (startFactor 1, stepDelta 0.5) yields the
 * x1 → x1.5 → x2 → x2.5 → x3 sequence the player sees. T5 product lands
 * at 22.5x (1 × 1.5 × 2 × 2.5 × 3), which is the reason this is a rare-
 * tier sigil paired with a -2 Hand Size penalty. Originally shipped at
 * stepDelta 1 (T5 = 120x) but that curve trivialized mid-round enemies
 * when Big Bang landed early — the gentler ramp preserves the
 * "committed T5 = dramatic payoff" fantasy without collapsing the
 * early game.
 *
 * Position 0 (the first rune) emitting a factor of 1 is a no-op math-wise
 * but DELIBERATELY kept visible — the "x1" bubble reads as the start of
 * the escalation and the sigil shake still fires. If a future variant
 * wants to skip the leading identity event, add a `skipFirstRune?: boolean`
 * flag here and gate the loop body on it.
 *
 * Feeds the multiplicative channel alongside Category 6 (static spell-
 * element xMult) and Category 12 (accumulator xMult): final xMult =
 * static × accumulator × cumulative. Fires as a sequence of `isXMult`
 * events in `buildXMultEvents` — AFTER all additive mult ticks — so the
 * Mult counter animation ends at the correct math value. The timeline
 * handler dispatches `onSigilShake(sigilId)` generically, so no cast
 * timeline changes were needed to add Big Bang.
 */
export interface CumulativeCastXMultEffect {
    /** xMult factor for rune N = `startFactor + stepDelta × N`. */
    startFactor: number;
    stepDelta: number;
}

export const SIGIL_CUMULATIVE_CAST_X_MULT: Record<string, CumulativeCastXMultEffect> = {
    big_bang: { startFactor: 1, stepDelta: 0.5 },
};

export interface CumulativeCastXMultEntry {
    sigilId: string;
    /** Position in the contributing-runes array (0-indexed). */
    runeIdx: number;
    /** Multiplicative factor for this rune's event. */
    xMult: number;
}

/**
 * Build the per-rune xMult entries + product for all owned cumulative
 * cast xMult sigils. Entries are in (sigil × rune) order with runes
 * in contributing-array order, so the animation layer plays them in
 * the same left-to-right sequence the player saw the runes fly.
 */
export function getCumulativeCastXMult(
    sigils: readonly string[],
    contributingRuneCount: number,
): { total: number; entries: CumulativeCastXMultEntry[] } {
    let total = 1;
    const entries: CumulativeCastXMultEntry[] = [];
    // Note: Big Bang (the only sigil in this category today) is in
    // MIMIC_INCOMPATIBLE — a second copy would stack (N!)² xMult which
    // is game-breaking at T5. forEachOwnedSigil's Mimic expansion is a
    // no-op here in practice.
    forEachOwnedSigil(sigils, SIGIL_CUMULATIVE_CAST_X_MULT, (effect, sigilId) => {
        for (let i = 0; i < contributingRuneCount; i++) {
            const factor = effect.startFactor + effect.stepDelta * i;
            total *= factor;
            entries.push({ sigilId, runeIdx: i, xMult: factor });
        }
    });
    return { total, entries };
}

// ============================================================================
// Module-Load Validation
// ============================================================================

// Each RNG sigil must have a unique `rngOffset` within its category's band so
// server and client stay deterministic. Catch duplicates, out-of-band offsets,
// and slots that don't line up with SIGIL_RNG_OFFSET_SPACING at startup —
// never as a silent runtime desync.
function validateRngBand<T extends { rngOffset: number }>(
    registryName: string,
    slotHelper: string,
    base: number,
    entries: Record<string, T>,
): void {
    const seen = new Map<number, string>();
    for (const [sigilId, def] of Object.entries(entries)) {
        const offset = def.rngOffset;
        if (offset < base || offset >= base + SIGIL_RNG_BAND_WIDTH) {
            throw new Error(
                `${registryName}: "${sigilId}" rngOffset ${offset} is outside the band ` +
                `[${base}, ${base + SIGIL_RNG_BAND_WIDTH}). Use ${slotHelper}(n).`,
            );
        }
        if ((offset - base) % SIGIL_RNG_OFFSET_SPACING !== 0) {
            throw new Error(
                `${registryName}: "${sigilId}" rngOffset ${offset} is not a multiple of ` +
                `SIGIL_RNG_OFFSET_SPACING (${SIGIL_RNG_OFFSET_SPACING}) above base. ` +
                `Use ${slotHelper}(n).`,
            );
        }
        const existing = seen.get(offset);
        if (existing !== undefined) {
            throw new Error(
                `${registryName}: rngOffset ${offset} is used by both "${existing}" and "${sigilId}". ` +
                `Each sigil must use a unique ${slotHelper}(n).`,
            );
        }
        seen.set(offset, sigilId);
    }
}

(() => {
    validateRngBand("SIGIL_PROCS", "procRngSlot", PROC_RNG_OFFSET_BASE, SIGIL_PROCS);
    validateRngBand("SIGIL_CAST_RNG_MULT", "castRngMultRngSlot", CAST_RNG_MULT_RNG_OFFSET_BASE, SIGIL_CAST_RNG_MULT);
})();
