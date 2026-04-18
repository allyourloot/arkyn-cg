import { ARCANE_CLUSTER_ELEMENTS, ELEMENT_TYPES, type ElementType } from "./arkynConstants";
import { createRoundRng } from "./seededRandom";

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
// Deterministic RNG across server + client requires each sigil-driven roll to
// live in its OWN namespace so rolls don't correlate. Offsets are picked in
// 10k-wide bands per category; sigils inside a category reserve a "slot"
// (0, 1, 2, …) and the actual offset is `base + slot * spacing`.
//
// Namespace map (global — flagged to avoid cross-file collisions):
//   [      0] Enemy selection                   (enemyDefinitions)
//   [  50000] Boss debuff roll                  (bossDebuffs)
//   [ 100000] Shop scroll generation            (shopGeneration)
//   [ 200000] Shop sigil generation             (shopGeneration)
//   [ 300000–399999] SIGIL_PROCS                 (this file)
//   [ 400000–499999] SIGIL_LIFECYCLE_HOOKS       (this file)
//       slot 0 = Thief, slot 1 = Binoculars
//   [ 400000 + round + bagIndex*7919] Rune Bag  (rollBagRunes)  ⚠ shares the
//       lifecycle base; the two streams don't interact today because Thief's
//       read is  `400000 + round`  (slot 0 only) while RuneBag's read is
//       `400000 + round + bagIndex*7919`  — the bagIndex jitter steps clear
//       of the lifecycle band as long as bagIndex >= 1 for any OTHER
//       lifecycle sigil in slot 1+. Adding a new lifecycle sigil here MUST
//       pick a slot > 0 (so its stream is 410000+round, 420000+round, …)
//       or the first bag of a given round will correlate with its roll.
//
// New proc sigils: pick the next unused slot (append-only to preserve replay
// determinism for saved runs). Validated at module load — any duplicate or
// out-of-band offset throws.

export const PROC_RNG_OFFSET_BASE = 300000;
export const LIFECYCLE_RNG_OFFSET_BASE = 400000;
export const SIGIL_RNG_OFFSET_SPACING = 10000;
/** Width of a category's band — procs live in [300000, 400000). */
const SIGIL_RNG_BAND_WIDTH = 100000;

/**
 * Compute the RNG offset for a proc sigil's slot. Slot is append-only —
 * reusing slot 0 (Voltage), 1 (Fortune), 2 (Hourglass) preserves replay
 * determinism. Use `procRngSlot(n)` in a proc definition's `rngOffset` field
 * instead of writing the raw number.
 */
export function procRngSlot(slot: number): number {
    return PROC_RNG_OFFSET_BASE + slot * SIGIL_RNG_OFFSET_SPACING;
}

/** Same as `procRngSlot` but for lifecycle hooks. Slot 0 = Thief. */
export function lifecycleRngSlot(slot: number): number {
    return LIFECYCLE_RNG_OFFSET_BASE + slot * SIGIL_RNG_OFFSET_SPACING;
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
};

/**
 * Sum all stat deltas across a player's owned sigils. Returns a zero'd
 * delta object if no sigils modify stats.
 */
export function getPlayerStatDeltas(sigils: readonly string[]): PlayerStatDeltas {
    const out: PlayerStatDeltas = { castsPerRound: 0, discardsPerRound: 0, handSize: 0 };
    for (const sigilId of sigils) {
        const delta = SIGIL_STAT_MODIFIERS[sigilId];
        if (!delta) continue;
        if (delta.castsPerRound) out.castsPerRound += delta.castsPerRound;
        if (delta.discardsPerRound) out.discardsPerRound += delta.discardsPerRound;
        if (delta.handSize) out.handSize += delta.handSize;
    }
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
 */
export type ProcEffect =
    | { type: "double_damage" }
    | { type: "grant_gold"; amount: number };

export interface ProcDefinition {
    /** Element the proc checks for. `undefined` = any element triggers the roll. */
    element?: ElementType;
    /**
     * If true, the proc only rolls for runes that landed a critical hit
     * (rune element matched an enemy weakness). Independent of `element`
     * — a proc can require both, either, or neither.
     */
    requireCritical?: boolean;
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
): Generator<ProcEvent, void, unknown> {
    for (const sigilId of sigils) {
        const proc = SIGIL_PROCS[sigilId];
        if (!proc) continue;
        const rng = createRoundRng(runSeed, proc.rngOffset + round * 10 + castNumber);
        for (let i = 0; i < contributingRuneElements.length; i++) {
            const element = contributingRuneElements[i];
            if (proc.element !== undefined && element !== proc.element) continue;
            if (proc.requireCritical && !isCritical?.[i]) continue;
            if (rng() < proc.chance) {
                yield { sigilId, runeIdx: i, effect: proc.effect };
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
    for (const sigilId of sigils) {
        const effect = SIGIL_HAND_MULT[sigilId];
        if (!effect) continue;
        for (let i = 0; i < hand.length; i++) {
            if (excluded.has(i)) continue;
            const rune = hand[i];
            if (!rune || rune.element !== effect.element) continue;
            total += effect.multPerRune;
            perSigil.push({ sigilId, handIndex: i, multDelta: effect.multPerRune });
        }
    }
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
    | { type: "disableResistance"; element: string };

/**
 * Context passed to round-start lifecycle hooks. Carries the freshly-spawned
 * enemy's affinities so hooks can make decisions conditioned on the current
 * matchup (Binoculars picks one of the enemy's resistances to nullify).
 * Optional so existing hooks that don't need enemy data (Thief) can ignore it.
 */
export interface RoundStartContext {
    readonly enemyResistances: readonly string[];
    readonly enemyWeaknesses: readonly string[];
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

export const SIGIL_LIFECYCLE_HOOKS: Record<string, SigilLifecycleHooks> = {
    thief: {
        onRoundStart(round, runSeed) {
            const rng = createRoundRng(runSeed, THIEF_RNG_OFFSET + round);
            const element = ELEMENT_TYPES[Math.floor(rng() * ELEMENT_TYPES.length)];
            return [{ type: "grantConsumable", consumableId: element }];
        },
    },
    binoculars: {
        onRoundStart(round, runSeed, ctx) {
            // No-op if the enemy has no resistances to disable. Slot 1 (not 0)
            // avoids the latent rune-bag RNG collision documented at the top
            // of this file.
            if (ctx.enemyResistances.length === 0) return [];
            const rng = createRoundRng(runSeed, BINOCULARS_RNG_OFFSET + round);
            const element = ctx.enemyResistances[Math.floor(rng() * ctx.enemyResistances.length)];
            return [{ type: "disableResistance", element }];
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
    return sigils.some(id => SIGIL_LOOSE_DUO_UNLOCKS[id]);
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
    return sigils.some(id => SIGIL_ALL_UNIQUE_UNLOCKS[id]);
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
    for (const sigilId of sigils) {
        const effect = SIGIL_SPELL_X_MULT[sigilId];
        if (!effect) continue;
        if (spellElements.some(e => (effect.elements as readonly string[]).includes(e))) {
            total *= effect.xMult;
            entries.push({ sigilId, xMult: effect.xMult });
        }
    }
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
    for (const sigilId of sigils) {
        const elements = SIGIL_RESIST_IGNORE[sigilId];
        if (!elements) continue;
        for (const e of elements) out.add(e);
    }
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
    for (const sigilId of sigils) {
        const effect = SIGIL_END_OF_ROUND_GOLD[sigilId];
        if (!effect) continue;
        total += effect.amount;
        entries.push({ sigilId, amount: effect.amount });
    }
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
    for (const sigilId of sigils) {
        const effect = SIGIL_PLAYED_MULT[sigilId];
        if (!effect) continue;
        const triggers = effect.elements as readonly string[];
        for (let i = 0; i < contributingRunes.length; i++) {
            if (!triggers.includes(contributingRunes[i].element)) continue;
            total += effect.multPerRune;
            perSigil.push({ sigilId, contributingRuneIdx: i, multDelta: effect.multPerRune });
        }
    }
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
    element?: ElementType;
    /** If true, the bonus only fires when the rune hit a weakness (crit). */
    requireCritical?: boolean;
    /** Flat base damage added per matching rune (post resist/weak mod). */
    baseBonus: number;
    /** Additive mult added per matching rune. Same channel as Arcana. */
    multBonus: number;
}

export const SIGIL_ELEMENT_RUNE_BONUS: Record<string, ElementRuneBonusEffect> = {
    lex_divina: { element: "holy", requireCritical: true, baseBonus: 8, multBonus: 2 },
    engine: { element: "steel", baseBonus: 4, multBonus: 2 },
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
    for (const sigilId of sigils) {
        const effect = SIGIL_ELEMENT_RUNE_BONUS[sigilId];
        if (!effect) continue;
        for (let i = 0; i < contributingRuneElements.length; i++) {
            if (effect.requireCritical && !isCritical[i]) continue;
            if (effect.element !== undefined && contributingRuneElements[i] !== effect.element) continue;
            perRuneBase[i] += effect.baseBonus;
            totalMult += effect.multBonus;
            entries.push({
                sigilId,
                contributingRuneIdx: i,
                baseDelta: effect.baseBonus,
                multDelta: effect.multBonus,
            });
        }
    }
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
    executioner: { trigger: "criticalHit", perEventDelta: 0.2, initialValue: 1.0 },
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
    for (const sigilId of sigils) {
        const def = SIGIL_ACCUMULATOR_XMULT[sigilId];
        if (!def) continue;
        const value = accumulators[sigilId] ?? def.initialValue;
        if (value === 1) continue;
        total *= value;
        entries.push({ sigilId, xMult: value });
    }
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
    for (const sigilId of sigils) {
        bonus += SIGIL_SCROLL_LEVEL_BONUS[sigilId] ?? 0;
    }
    return 1 + bonus;
}

// ============================================================================
// Module-Load Validation
// ============================================================================

// Each proc sigil must have a unique `rngOffset` within the proc band so
// server and client stay deterministic. Catch duplicates, out-of-band
// offsets, and slots that don't line up with SIGIL_RNG_OFFSET_SPACING at
// startup — never as a silent runtime desync.
(() => {
    const seen = new Map<number, string>();
    for (const [sigilId, proc] of Object.entries(SIGIL_PROCS)) {
        const offset = proc.rngOffset;
        if (offset < PROC_RNG_OFFSET_BASE || offset >= PROC_RNG_OFFSET_BASE + SIGIL_RNG_BAND_WIDTH) {
            throw new Error(
                `SIGIL_PROCS: "${sigilId}" rngOffset ${offset} is outside the proc band ` +
                `[${PROC_RNG_OFFSET_BASE}, ${PROC_RNG_OFFSET_BASE + SIGIL_RNG_BAND_WIDTH}). ` +
                `Use procRngSlot(n) to derive the offset.`,
            );
        }
        if ((offset - PROC_RNG_OFFSET_BASE) % SIGIL_RNG_OFFSET_SPACING !== 0) {
            throw new Error(
                `SIGIL_PROCS: "${sigilId}" rngOffset ${offset} is not a multiple of ` +
                `SIGIL_RNG_OFFSET_SPACING (${SIGIL_RNG_OFFSET_SPACING}) above base. ` +
                `Use procRngSlot(n).`,
            );
        }
        const existing = seen.get(offset);
        if (existing !== undefined) {
            throw new Error(
                `SIGIL_PROCS: rngOffset ${offset} is used by both "${existing}" and "${sigilId}". ` +
                `Each proc sigil must use a unique procRngSlot(n).`,
            );
        }
        seen.set(offset, sigilId);
    }
})();
