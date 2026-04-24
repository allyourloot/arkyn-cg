import {
    MAX_PLAY,
    CASTS_PER_ROUND,
    SIGIL_ACCUMULATOR_XMULT,
    composeCastModifiers,
    iterateProcs,
    resolveSpell,
    calculateSpellDamage,
    getContributingRuneIndices,
    type ProcEffect,
} from "../../shared";
import type { RarityType } from "../../shared/arkynConstants";
import { BUBBLE_STAGGER_MS } from "./timingConstants";
import { arkynStoreInternal } from "../arkynStore";
import type { RuneClientData } from "../arkynStoreCore";
import type { RuneDamageBubble, HandMultBubble, RuneXMultBubble } from "../arkynAnimations";

/**
 * Runtime timeline event — the union the cast timeline consumes. Each entry
 * fires one bubble/counter-tick/reveal step. Interleaved in this order so
 * the animation reads left-to-right: damage → damage-procs → played-mult
 * ticks → hand-mult ticks → xMult reveal.
 */
export interface CastBreakdownEvent {
    base: number;
    final: number;
    isResisted: boolean;
    isCritical: boolean;
    isProc: boolean;
    isMultTick?: boolean;
    isGold?: boolean;
    isXMult?: boolean;
    /**
     * Execute proc (Blackjack). No bubble, no counter tick — the timeline
     * fires a spritesheet + SFX at this event's delay to signal the
     * guaranteed kill. The damage adjustment happens up-front in the
     * cast assembly (totalDamage is forced to ≥ enemy HP); this event
     * purely drives the visual + audio reveal.
     */
    isExecute?: boolean;
    /**
     * Post-cast accumulator increment (Executioner-style). Doesn't tick
     * Base or Mult — the xMult from the OLD accumulator value was already
     * baked into the cast's damage. This event just flashes a "+Nx" bubble
     * below the sigil so the player can see the growth in real time rather
     * than only noticing it via the SigilBar tooltip on the next cast.
     */
    isAccumulatorInc?: boolean;
    /**
     * xMult reveal came from SIGIL_CUMULATIVE_CAST_X_MULT (Big Bang). The
     * floating "x{factor}" bubble mounts over the triggering rune's slot
     * (pre-populated into `xMultBubblesForCast[slotIdx]`), NOT under the
     * sigil — the per-rune mechanic reads naturally as a ramp across the
     * play area. Timeline skips the sigil-side bubble path for these.
     */
    isPerRuneXMult?: boolean;
    /**
     * xMult reveal came from SIGIL_SPELL_X_MULT (Supercell / Eruption /
     * Zephyr) — a single spell-level bonus. Timeline fires the sigil-side
     * "x{factor}" proc bubble for these. Accumulator xMult reveals
     * (Executioner) carry NEITHER flag and produce no reveal bubble —
     * Executioner already gets per-crit "+0.1x" bubbles during the cast.
     */
    isSpellXMult?: boolean;
    goldDelta?: number;
    multDelta?: number;
    xMultFactor?: number;
    /** Delta added to the sigil's accumulator by this event (e.g. 0.2 for Executioner). */
    accumulatorDelta?: number;
    sigilId?: string;
}

export interface CastBreakdownAssembly {
    runeBreakdown: CastBreakdownEvent[];
    bubbles: (RuneDamageBubble | null)[];
    /**
     * Per-slot ARRAY of proc bubbles — one entry per proc event fired on
     * the slot's rune. Empty arrays mean no procs. Multiple entries allow
     * Mimic-stacked retriggers (Mimic+Chainlink → 2 retriggers per rune)
     * to render as a staggered sequence instead of collapsing into a
     * single overwritten bubble.
     */
    procBubblesForCast: RuneDamageBubble[][];
    /**
     * Per-slot ARRAY of "x{factor}" bubbles — one entry per cumulative
     * xMult event (Big Bang) fired on the slot's contributing rune. Empty
     * arrays mean no cumulative-xMult sigil is active. Each entry carries
     * its own delayMs so the bubbles stagger across contributing slots
     * in the same order Big Bang's events fire on the timeline (x1 → x1.5
     * → x2 → x2.5 → x3 for a T5 cast).
     */
    xMultBubblesForCast: RuneXMultBubble[][];
    handMultBubblesForCast: (HandMultBubble | null)[];
    resolvedSpell: ReturnType<typeof resolveSpell>;
    contributingIndices: number[];
    totalDamage: number;
    spellBaseDamage: number;
    baseTotal: number;
    hasCritical: boolean;
    hasAnyProc: boolean;
    hasAnyExecute: boolean;
    hasAnyMultEvent: boolean;
    hasAnyAccumulatorInc: boolean;
    /** True if any spell-level xMult sigil (Supercell/Eruption/Zephyr) fired — drives onXMultReveal wiring. */
    hasAnySpellXMult: boolean;
    spellElement: string;
}

// ----- Shared internal types -----

type SpellBreakdown = NonNullable<ReturnType<typeof calculateSpellDamage>>;
type ProcEntry = { sigilId: string; effect: ProcEffect };

// ----- Bubble seq counter -----
// Monotonically increasing key used by `RuneDamageBubble` / `HandMultBubble`
// so React can distinguish two visually-identical bubbles that fire back-to-
// back (same slot, same amount). Counter is module-local — only the sub-
// functions below mutate it.
let bubbleSeqCounter = 0;
function nextBubbleSeq(): number {
    return ++bubbleSeqCounter;
}

// ----- Sub-function: proc iteration + totalDamage/baseTotal adjustments -----

/**
 * Iterate sigil procs for the cast — identical loop to the server's
 * `iterateProcs` consumer in `calculateDamage`. Returns the per-rune proc
 * list, the proc damage total, and the post-proc `totalDamage` (with the
 * execute clamp applied when any proc executed) + `baseTotalDelta` (how
 * much damage-type procs added to the Base total for the `lastCastBaseDamage`
 * snapshot).
 */
function iterateCastProcs(args: {
    ownedSigils: readonly string[];
    breakdown: SpellBreakdown | null;
    contributingIndices: number[];
    castRunes: RuneClientData[];
    initialTotalDamage: number;
}): {
    procsPerRune: ProcEntry[][];
    hasAnyProc: boolean;
    hasAnyExecute: boolean;
    totalDamage: number;
    baseTotalDelta: number;
} {
    const { ownedSigils, breakdown, contributingIndices, castRunes, initialTotalDamage } = args;
    const procsPerRune: ProcEntry[][] = Array.from({ length: contributingIndices.length }, () => []);
    let procDamageTotal = 0;

    if (breakdown && ownedSigils.length > 0) {
        const castNumber = CASTS_PER_ROUND - arkynStoreInternal.getCastsRemaining();
        const runSeed = arkynStoreInternal.getRunSeed();
        const round = arkynStoreInternal.getCurrentRound();
        // Matches the server-side gate in calculateDamage: castsRemaining
        // here is the PRE-cast snapshot (the store hasn't been decremented
        // yet), so castsRemaining === 1 is Chainlink's final-cast trigger.
        const isFinalCast = arkynStoreInternal.getCastsRemaining() === 1;
        const contributingElements = contributingIndices.map(idx => castRunes[idx]?.element ?? "");
        for (const proc of iterateProcs(
            ownedSigils,
            contributingElements,
            runSeed,
            round,
            castNumber,
            breakdown.isCritical,
            isFinalCast,
        )) {
            procsPerRune[proc.runeIdx].push({ sigilId: proc.sigilId, effect: proc.effect });
            if (proc.effect.type === "double_damage") {
                procDamageTotal += Math.round(breakdown.runeBaseContributions[proc.runeIdx] * breakdown.mult);
            }
            // grant_gold: no damage contribution — handled when building
            // the proc bubble (kind: "gold"). execute: no incremental
            // damage; forces totalDamage up to enemy HP so the kill is
            // guaranteed. The timeline layer fires spritesheet + SFX at
            // the proc's event for both variants.
        }
    }

    const hasAnyProc = procsPerRune.some(arr => arr.length > 0);
    const hasAnyExecute = procsPerRune.some(arr => arr.some(p => p.effect.type === "execute"));
    let totalDamage = initialTotalDamage + procDamageTotal;
    // Execute procs (Blackjack) guarantee the kill but PRESERVE natural
    // damage — `Math.max` keeps a high-damage cast's number intact for
    // the highest-damage stat / Total chip display, while bumping low-
    // damage casts up to enemy HP so the kill lands.
    if (hasAnyExecute) {
        totalDamage = Math.max(totalDamage, arkynStoreInternal.getEnemyHp());
    }

    // Adjust baseTotal to include proc contributions (for lastCastBaseDamage).
    // Only damage-type procs contribute to Base — gold procs are pure economy.
    // Each damage proc on a rune adds that rune's base again, so N retriggers
    // add N × the rune's post-modifier base.
    let baseTotalDelta = 0;
    if (breakdown && hasAnyProc) {
        for (let i = 0; i < procsPerRune.length; i++) {
            for (const p of procsPerRune[i]) {
                if (p.effect.type === "double_damage") {
                    baseTotalDelta += breakdown.runeBaseContributions[i];
                }
            }
        }
    }

    return { procsPerRune, hasAnyProc, hasAnyExecute, totalDamage, baseTotalDelta };
}

// ----- Sub-function: per-rune damage events -----

/**
 * Walk each contributing rune in cast order, emit one base-damage event per
 * rune, and interleave that rune's procs + played-mult entries + element-
 * rune-bonus entries + cumulative xMult entries (Big Bang) + accumulator-
 * increment events (Executioner-style). Returns the events list, per-slot
 * bubble arrays, and the next event index for the downstream sub-functions
 * to continue staggering from.
 *
 * Ordering within a single rune's sub-sequence:
 *   1. damage event + bubble
 *   2. proc events + bubbles (Voltage / Hourglass / Chainlink / Fortune / Blackjack)
 *   3. played-mult events (Arcana — additive)
 *   4. element-rune-bonus mult events (Engine / Lex Divina / Alkahest — additive)
 *   5. cumulative xMult event + rune-slot bubble (Big Bang — multiplicative)
 *   6. accumulator-inc events (Executioner — per-crit "+0.1x" feedback)
 *
 * The Mult counter handles this interleaving correctly because castTimeline
 * tracks additive + multiplicative pools separately and recomputes the
 * display as `(baseMult + additive) × xMult` on every event — so a later
 * additive tick (e.g. Synapse hand-mult in Phase 3) still lands at the
 * correct final value even though it fires AFTER Big Bang's multiplicative
 * events.
 */
function buildRuneDamageEvents(args: {
    breakdown: SpellBreakdown | null;
    contributingIndices: number[];
    castRunes: RuneClientData[];
    procsPerRune: ProcEntry[][];
    playedMultEntries: readonly { sigilId: string; contributingRuneIdx: number; multDelta: number }[];
    elementRuneBonusEntries: readonly { sigilId: string; contributingRuneIdx: number; multDelta: number }[];
    cumulativeCastXMultEntries: readonly { sigilId: string; xMult: number; runeIdx: number }[];
    ownedSigils: readonly string[];
    spellElement: string;
    startEventIdx: number;
}): {
    events: CastBreakdownEvent[];
    bubbles: (RuneDamageBubble | null)[];
    procBubblesForCast: RuneDamageBubble[][];
    xMultBubblesForCast: RuneXMultBubble[][];
    nextEventIdx: number;
    hasAnyAccumulatorInc: boolean;
} {
    const {
        breakdown, contributingIndices, castRunes, procsPerRune,
        playedMultEntries, elementRuneBonusEntries, cumulativeCastXMultEntries,
        ownedSigils, spellElement, startEventIdx,
    } = args;

    const events: CastBreakdownEvent[] = [];
    const bubbles: (RuneDamageBubble | null)[] = new Array(MAX_PLAY).fill(null);
    // Per-slot ARRAY of proc bubbles — multi-proc retriggers (Mimic +
    // Chainlink) push more than one entry per slot so PlayArea can render
    // each bubble as its own component with its own delayMs.
    const procBubblesForCast: RuneDamageBubble[][] = Array.from({ length: MAX_PLAY }, () => []);
    // Per-slot ARRAY of Big Bang "x{factor}" bubbles — anchors to the
    // contributing rune's slot so the bubble reads as "this rune just
    // multiplied damage by N." Interleaved with each rune's damage event
    // below.
    const xMultBubblesForCast: RuneXMultBubble[][] = Array.from({ length: MAX_PLAY }, () => []);
    let eventIdx = startEventIdx;
    let hasAnyAccumulatorInc = false;

    if (!breakdown) {
        return { events, bubbles, procBubblesForCast, xMultBubblesForCast, nextEventIdx: eventIdx, hasAnyAccumulatorInc };
    }

    for (let i = 0; i < contributingIndices.length; i++) {
        const slotIdx = contributingIndices[i];
        const rune = castRunes[slotIdx];
        if (!rune) continue;
        const isCritical = breakdown.isCritical[i];
        const isResisted = breakdown.isResisted[i];
        const postModifier = breakdown.runeBaseContributions[i];

        bubbles[slotIdx] = {
            amount: postModifier,
            baseAmount: postModifier,
            spellElement,
            isCritical,
            isResisted,
            seq: nextBubbleSeq(),
            delayMs: eventIdx * BUBBLE_STAGGER_MS,
        };
        events.push({
            base: postModifier,
            final: postModifier,
            isResisted,
            isCritical,
            isProc: false,
        });
        eventIdx++;

        // Interleave proc bubbles right after the parent rune. Damage procs
        // (Voltage/Hourglass/Chainlink) show the rune's base contribution
        // again; gold procs (Fortune) show the flat gold amount with the
        // "gold" bubble variant and contribute nothing to damage. Execute
        // procs (Blackjack) don't add incremental damage — the timeline
        // fires the spritesheet + SFX at the event's delay to signal the
        // execute.
        for (const proc of procsPerRune[i]) {
            if (proc.effect.type === "execute") {
                // No bubble for executes — the spritesheet is the visual.
                events.push({
                    base: 0,
                    final: 0,
                    isResisted: false,
                    isCritical: false,
                    isProc: true,
                    isExecute: true,
                    sigilId: proc.sigilId,
                });
                eventIdx++;
                continue;
            }
            const isGoldProc = proc.effect.type === "grant_gold";
            // Narrow `proc.effect` by discriminator so TypeScript knows
            // `amount` exists on the gold branch. Cached so the bubble/event
            // builders below can reference it without repeating the check.
            const goldAmount = proc.effect.type === "grant_gold" ? proc.effect.amount : 0;
            const bubbleAmount = isGoldProc ? goldAmount : postModifier;
            // Damage retrigger procs (Voltage/Hourglass/Chainlink) fire the
            // SAME rune a second time, so the retrigger bubble should carry
            // the parent rune's crit/resist state — otherwise a critical
            // rune shows a golden crit bubble on the first hit and a plain
            // bubble on the retrigger. Gold procs (Fortune) don't carry
            // damage status; their bubble is a separate "gold" variant.
            const procIsCritical = isGoldProc ? false : isCritical;
            const procIsResisted = isGoldProc ? false : isResisted;
            procBubblesForCast[slotIdx].push({
                amount: bubbleAmount,
                baseAmount: bubbleAmount,
                spellElement,
                isCritical: procIsCritical,
                isResisted: procIsResisted,
                seq: nextBubbleSeq(),
                delayMs: eventIdx * BUBBLE_STAGGER_MS,
                kind: isGoldProc ? "gold" : "damage",
            });
            events.push({
                base: isGoldProc ? 0 : postModifier,
                final: isGoldProc ? 0 : postModifier,
                isResisted: procIsResisted,
                isCritical: procIsCritical,
                isProc: true,
                isGold: isGoldProc,
                goldDelta: isGoldProc ? goldAmount : undefined,
                sigilId: proc.sigilId,
            });
            eventIdx++;
        }

        // Played-rune mult events (Arcana-style) — one per matching sigil/
        // rune pair. Interleaved after the parent rune's damage (and optional
        // proc) so the Mult counter ticks in lockstep with the rune that
        // triggered it. No separate bubble; the mult counter + sigil shake
        // carry the feedback.
        for (const pm of playedMultEntries) {
            if (pm.contributingRuneIdx !== i) continue;
            events.push({
                base: 0,
                final: 0,
                isResisted: false,
                isCritical: false,
                isProc: false,
                isMultTick: true,
                multDelta: pm.multDelta,
                sigilId: pm.sigilId,
            });
            eventIdx++;
        }

        // Element-rune-bonus mult events (Engine / Lex Divina-style) — one
        // per matching sigil × qualifying rune. Same event shape as Arcana;
        // the base portion is already baked into this rune's bubble via
        // `perRuneBaseBonus`, so only the mult part needs a tick.
        for (const erb of elementRuneBonusEntries) {
            if (erb.contributingRuneIdx !== i) continue;
            events.push({
                base: 0,
                final: 0,
                isResisted: false,
                isCritical: false,
                isProc: false,
                isMultTick: true,
                multDelta: erb.multDelta,
                sigilId: erb.sigilId,
            });
            eventIdx++;
        }

        // Cumulative cast xMult events (Big Bang-style) — interleaved per
        // rune so each contributing rune plays its full proc sequence
        // (damage → procs → additive mult → xMult) before moving to the
        // next rune. Reads as a left-to-right ramp across the play area
        // with damage bubbles pairing with "x{factor}" bubbles. The rune-
        // slot bubble is anchored to `slotIdx` (the physical play-area
        // slot) via `contributingIndices[i]`.
        for (const cce of cumulativeCastXMultEntries) {
            if (cce.runeIdx !== i) continue;
            const delayMs = eventIdx * BUBBLE_STAGGER_MS;
            xMultBubblesForCast[slotIdx].push({
                factor: cce.xMult,
                seq: nextBubbleSeq(),
                delayMs,
            });
            events.push({
                base: 0,
                final: 0,
                isResisted: false,
                isCritical: false,
                isProc: false,
                isXMult: true,
                isPerRuneXMult: true,
                xMultFactor: cce.xMult,
                sigilId: cce.sigilId,
            });
            eventIdx++;
        }

        // Accumulator-increment events (Executioner-style). Emit one per
        // owned accumulator sigil whose trigger matches this rune's event
        // (today only "criticalHit"). The accumulator itself is patched
        // server-side post-cast via applyAccumulatorIncrements — this event
        // is pure feedback so the player sees the xMult growing as crits
        // land. Iterates the RAW owned sigils (not Mimic-expanded) because
        // accumulator storage is keyed by sigil id.
        if (isCritical) {
            for (const sigilId of ownedSigils) {
                const def = SIGIL_ACCUMULATOR_XMULT[sigilId];
                if (!def) continue;
                if (def.trigger !== "criticalHit") continue;
                events.push({
                    base: 0,
                    final: 0,
                    isResisted: false,
                    isCritical: false,
                    isProc: false,
                    isAccumulatorInc: true,
                    accumulatorDelta: def.perEventDelta,
                    sigilId,
                });
                eventIdx++;
                hasAnyAccumulatorInc = true;
            }
        }
    }

    return { events, bubbles, procBubblesForCast, xMultBubblesForCast, nextEventIdx: eventIdx, hasAnyAccumulatorInc };
}

// ----- Sub-function: hand-mult bubbles + breakdown events -----

/**
 * Build mult bubbles for each held rune that matches a hand-mult sigil's
 * element (Synapse-style). These appear on hand rune cards during the
 * bubble phase, staggered after all play-area bubbles finish. Each entry
 * carries its triggering sigilId so the timeline dispatches shakes
 * generically.
 */
function buildHandMultEvents(args: {
    handLength: number;
    handMultEntries: readonly { sigilId: string; handIndex: number; multDelta: number }[];
    startEventIdx: number;
}): {
    events: CastBreakdownEvent[];
    handMultBubblesForCast: (HandMultBubble | null)[];
    nextEventIdx: number;
} {
    const { handLength, handMultEntries, startEventIdx } = args;
    const events: CastBreakdownEvent[] = [];
    const handMultBubblesForCast: (HandMultBubble | null)[] = new Array(handLength).fill(null);
    let eventIdx = startEventIdx;
    for (const entry of handMultEntries) {
        handMultBubblesForCast[entry.handIndex] = {
            amount: entry.multDelta,
            seq: nextBubbleSeq(),
            delayMs: eventIdx * BUBBLE_STAGGER_MS,
        };
        events.push({
            base: 0,
            final: 0,
            isResisted: false,
            isCritical: false,
            isProc: false,
            isMultTick: true,
            multDelta: entry.multDelta,
            sigilId: entry.sigilId,
        });
        eventIdx++;
    }
    return { events, handMultBubblesForCast, nextEventIdx: eventIdx };
}

// ----- Sub-function: flat additive mult events -----

/**
 * Emit one `isMultTick` event per entry across the three "flat additive mult"
 * categories (inventory-mult, cast-rng-mult, spell-tier-mult). All three
 * share identical event shape (no per-rune correlation, no bubble — pure
 * Mult-counter tick + sigil shake) so they fan out through one helper.
 * Ordering is preserved: inventory → castRng → spellTier, matching the
 * pre-split sequence.
 */
function buildFlatMultEvents(args: {
    inventoryMultEntries: readonly { sigilId: string; multDelta: number }[];
    castRngMultEntries: readonly { sigilId: string; multDelta: number }[];
    spellTierMultEntries: readonly { sigilId: string; multDelta: number }[];
    startEventIdx: number;
}): {
    events: CastBreakdownEvent[];
    nextEventIdx: number;
} {
    const { inventoryMultEntries, castRngMultEntries, spellTierMultEntries, startEventIdx } = args;
    const events: CastBreakdownEvent[] = [];
    let eventIdx = startEventIdx;
    const sources: readonly (readonly { sigilId: string; multDelta: number }[])[] = [
        inventoryMultEntries,
        castRngMultEntries,
        spellTierMultEntries,
    ];
    for (const source of sources) {
        for (const entry of source) {
            events.push({
                base: 0,
                final: 0,
                isResisted: false,
                isCritical: false,
                isProc: false,
                isMultTick: true,
                multDelta: entry.multDelta,
                sigilId: entry.sigilId,
            });
            eventIdx++;
        }
    }
    return { events, nextEventIdx: eventIdx };
}

// ----- Sub-function: xMult reveal events -----

/**
 * Emit the end-of-cast xMult reveal events — static spell-element xMult
 * (Supercell/Eruption/Zephyr) first, then accumulator xMult (Executioner).
 * These fire AFTER all additive mult ticks so the sigil-side bubble lands
 * as a single dramatic "x{factor}" reveal rather than lost in the middle
 * of per-rune damage noise.
 *
 * Cumulative per-rune xMult (Big Bang) is NOT in this phase — it's
 * interleaved inside `buildRuneDamageEvents` so each contributing rune
 * plays damage → xMult in sequence before moving on. The Mult counter
 * stays correct under either ordering because castTimeline tracks
 * additive + multiplicative pools separately.
 *
 * Bubble routing (see `CastBreakdownEvent` flags):
 *  - Spell-level events carry `isSpellXMult: true` → sigil-side "x{factor}"
 *    bubble under the triggering sigil via `onXMultReveal`.
 *  - Accumulator events carry neither flag — the per-crit "+0.1x" bubbles
 *    fired during the cast already feedback the accumulator build-up, so
 *    the final reveal doesn't spawn another bubble on top.
 */
function buildXMultEvents(args: {
    xMultEntries: readonly { sigilId: string; xMult: number }[];
    accumulatorXMultEntries: readonly { sigilId: string; xMult: number }[];
    startEventIdx: number;
}): {
    events: CastBreakdownEvent[];
    nextEventIdx: number;
} {
    const { xMultEntries, accumulatorXMultEntries, startEventIdx } = args;
    const events: CastBreakdownEvent[] = [];
    let eventIdx = startEventIdx;

    // Spell-element xMult (Supercell/Eruption/Zephyr).
    for (const entry of xMultEntries) {
        events.push({
            base: 0,
            final: 0,
            isResisted: false,
            isCritical: false,
            isProc: false,
            isXMult: true,
            isSpellXMult: true,
            xMultFactor: entry.xMult,
            sigilId: entry.sigilId,
        });
        eventIdx++;
    }

    // Accumulator xMult reveal (Executioner). No bubble — the per-crit
    // "+0.1x" bubbles during cast are the feedback channel.
    for (const entry of accumulatorXMultEntries) {
        events.push({
            base: 0,
            final: 0,
            isResisted: false,
            isCritical: false,
            isProc: false,
            isXMult: true,
            xMultFactor: entry.xMult,
            sigilId: entry.sigilId,
        });
        eventIdx++;
    }

    return { events, nextEventIdx: eventIdx };
}

// ----- Public entry point -----

/**
 * Pure-ish computation: resolve the spell, compose sigil modifiers, run the
 * damage formula, iterate procs, and assemble the per-slot bubble arrays +
 * the flat `runeBreakdown` event list the cast timeline consumes. Reads
 * from `arkynStoreInternal` for scroll levels / resistances / RNG seeds
 * (same store the server mirrors); only mutates the module-local
 * `bubbleSeqCounter`. No animation side effects — the caller wires the
 * result into `buildCastTimeline`.
 */
export function assembleCastBreakdown(args: {
    castRunes: RuneClientData[];
    hand: RuneClientData[];
    sortedSelected: number[];
}): CastBreakdownAssembly {
    const { castRunes, hand, sortedSelected } = args;

    // Resolve the spell on the client so we can compute the same Base + Mult
    // breakdown the server uses. Each contributing rune is evaluated against
    // the enemy's resistances/weaknesses individually, so the per-rune
    // bubbles, the Spell Preview Base counter, and the floating enemy
    // damage number all read identical numbers from this single breakdown.
    const ownedSigils = arkynStoreInternal.getSigils();
    const resolvedSpell = resolveSpell(castRunes.map(r => ({ element: r.element })), ownedSigils);
    const contributingIndices = getContributingRuneIndices(castRunes, ownedSigils);
    const contributingRuneData = contributingIndices.map(i => ({ element: castRunes[i].element }));
    // Parallel rarity array — runs alongside contributingRuneData so
    // calculateSpellDamage can look up each rune's RUNE_BASE_DAMAGE.
    const contributingRuneRarities: RarityType[] = contributingIndices.map(
        i => castRunes[i].rarity as RarityType,
    );

    // Compose all sigil-driven cast modifiers through the shared helper —
    // server runs the identical helper so bonusMult / xMult / stripped
    // resistances match byte-for-byte. The `breakdowns` field carries the
    // per-sigil entries the animation layer uses to build hand bubbles,
    // played-rune mult ticks, and xMult reveal events.
    const modifiers = composeCastModifiers({
        sigils: ownedSigils,
        spellElements: resolvedSpell
            ? (resolvedSpell.comboElements ? [...resolvedSpell.comboElements] : [resolvedSpell.element])
            : [],
        spellTier: resolvedSpell?.tier ?? 0,
        hand,
        selectedIndices: sortedSelected,
        contributingRunes: contributingRuneData,
        rawResistances: arkynStoreInternal.getEnemyResistances(),
        weaknesses: arkynStoreInternal.getEnemyWeaknesses(),
        disabledResistance: arkynStoreInternal.getDisabledResistance(),
        sigilAccumulators: arkynStoreInternal.getSigilAccumulators(),
        runSeed: arkynStoreInternal.getRunSeed(),
        round: arkynStoreInternal.getCurrentRound(),
        castNumber: CASTS_PER_ROUND - arkynStoreInternal.getCastsRemaining(),
    });

    const breakdown = resolvedSpell
        ? calculateSpellDamage(
            resolvedSpell,
            contributingRuneData,
            contributingRuneRarities,
            modifiers.effectiveResistances,
            arkynStoreInternal.getEnemyWeaknesses(),
            arkynStoreInternal.getScrollLevels(),
            modifiers.bonusMult,
            modifiers.xMult,
            modifiers.perRuneBaseBonus,
        )
        : null;

    const spellBaseDamage = breakdown?.spellBase ?? 0;
    const hasCritical = breakdown?.isCritical.some(Boolean) ?? false;
    // The spell's primary element drives the outline color of every bubble
    // in this cast — and the matching enemy floating damage — so the
    // colorway reads as one cohesive spell impact.
    const spellElement = resolvedSpell?.element ?? "";

    // ----- Phase 1: procs -----
    // iterateCastProcs computes per-rune procs, clamps totalDamage for
    // execute procs, and returns the baseTotal delta from damage-type procs.
    const procResult = iterateCastProcs({
        ownedSigils,
        breakdown,
        contributingIndices,
        castRunes,
        initialTotalDamage: breakdown?.finalDamage ?? 0,
    });

    // ----- Phase 2: per-rune damage events -----
    // The big "for each contributing rune, emit bubble + interleave procs +
    // mult ticks + cumulative xMult + accumulator-incs" loop. Start event
    // index at 0.
    const runeSection = buildRuneDamageEvents({
        breakdown,
        contributingIndices,
        castRunes,
        procsPerRune: procResult.procsPerRune,
        playedMultEntries: modifiers.breakdowns.playedMult,
        elementRuneBonusEntries: modifiers.breakdowns.elementRuneBonus,
        cumulativeCastXMultEntries: modifiers.breakdowns.cumulativeCastXMult,
        ownedSigils,
        spellElement,
        startEventIdx: 0,
    });

    // ----- Phase 3: hand-mult bubbles (Synapse) -----
    const handMultSection = buildHandMultEvents({
        handLength: hand.length,
        handMultEntries: modifiers.breakdowns.handMult,
        startEventIdx: runeSection.nextEventIdx,
    });

    // ----- Phase 4: flat additive mult ticks (inventory + cast-rng + spell-tier) -----
    const flatMultSection = buildFlatMultEvents({
        inventoryMultEntries: modifiers.breakdowns.inventoryMult,
        castRngMultEntries: modifiers.breakdowns.castRngMult,
        spellTierMultEntries: modifiers.breakdowns.spellTierMult,
        startEventIdx: handMultSection.nextEventIdx,
    });

    // ----- Phase 5: xMult reveal (static + accumulator) -----
    // Cumulative per-rune xMult (Big Bang) is NOT here — interleaved in
    // Phase 2 so each rune plays its own damage → xMult sequence.
    const xMultSection = buildXMultEvents({
        xMultEntries: modifiers.breakdowns.xMult,
        accumulatorXMultEntries: modifiers.breakdowns.accumulatorXMult,
        startEventIdx: flatMultSection.nextEventIdx,
    });

    const runeBreakdown: CastBreakdownEvent[] = [
        ...runeSection.events,
        ...handMultSection.events,
        ...flatMultSection.events,
        ...xMultSection.events,
    ];

    const hasAnyMultEvent =
        modifiers.breakdowns.handMult.length > 0 ||
        modifiers.breakdowns.playedMult.length > 0 ||
        modifiers.breakdowns.xMult.length > 0 ||
        modifiers.breakdowns.accumulatorXMult.length > 0 ||
        modifiers.breakdowns.cumulativeCastXMult.length > 0 ||
        modifiers.breakdowns.elementRuneBonus.length > 0 ||
        modifiers.breakdowns.inventoryMult.length > 0 ||
        modifiers.breakdowns.spellTierMult.length > 0 ||
        modifiers.breakdowns.castRngMult.length > 0;

    return {
        runeBreakdown,
        bubbles: runeSection.bubbles,
        procBubblesForCast: runeSection.procBubblesForCast,
        xMultBubblesForCast: runeSection.xMultBubblesForCast,
        handMultBubblesForCast: handMultSection.handMultBubblesForCast,
        resolvedSpell,
        contributingIndices,
        totalDamage: procResult.totalDamage,
        spellBaseDamage,
        baseTotal: (breakdown?.baseTotal ?? 0) + procResult.baseTotalDelta,
        hasCritical,
        hasAnyProc: procResult.hasAnyProc,
        hasAnyExecute: procResult.hasAnyExecute,
        hasAnyMultEvent,
        hasAnyAccumulatorInc: runeSection.hasAnyAccumulatorInc,
        hasAnySpellXMult: modifiers.breakdowns.xMult.length > 0,
        spellElement,
    };
}
