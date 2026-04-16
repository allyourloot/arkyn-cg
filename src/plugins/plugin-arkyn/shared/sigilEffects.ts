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
 *
 * See plan: C:\Users\17326\.claude\plans\concurrent-dreaming-melody.md
 */

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
        rngOffset: 300000,
        effect: { type: "double_damage" },
    },
    fortune: {
        requireCritical: true,
        chance: 1 / 3,
        rngOffset: 310000,
        effect: { type: "grant_gold", amount: 2 },
    },
    hourglass: {
        // element omitted → any element triggers the roll
        chance: 0.25,
        rngOffset: 320000,
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

export interface RoundStartResult {
    grantConsumable?: string;
}

export interface SigilLifecycleHooks {
    onRoundStart?(round: number, runSeed: number): RoundStartResult | void;
}

const THIEF_RNG_OFFSET = 400000;

export const SIGIL_LIFECYCLE_HOOKS: Record<string, SigilLifecycleHooks> = {
    thief: {
        onRoundStart(round, runSeed) {
            const rng = createRoundRng(runSeed, THIEF_RNG_OFFSET + round);
            const element = ELEMENT_TYPES[Math.floor(rng() * ELEMENT_TYPES.length)];
            return { grantConsumable: element };
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
    for (const id of sigils) {
        if (SIGIL_LOOSE_DUO_UNLOCKS[id]) return true;
    }
    return false;
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
 */
export function getIgnoredResistanceElements(sigils: readonly string[]): Set<string> {
    const out = new Set<string>();
    for (const sigilId of sigils) {
        const elements = SIGIL_RESIST_IGNORE[sigilId];
        if (!elements) continue;
        for (const e of elements) out.add(e);
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
// Module-Load Validation
// ============================================================================

// Each proc sigil must have a unique `rngOffset` so server and client
// stay deterministic. Catch accidental duplicates at startup, not at
// runtime desync.
(() => {
    const seen = new Map<number, string>();
    for (const [sigilId, proc] of Object.entries(SIGIL_PROCS)) {
        const existing = seen.get(proc.rngOffset);
        if (existing !== undefined) {
            throw new Error(
                `SIGIL_PROCS: rngOffset ${proc.rngOffset} is used by both "${existing}" and "${sigilId}". ` +
                `Each proc sigil must have a unique offset.`,
            );
        }
        seen.set(proc.rngOffset, sigilId);
    }
})();
