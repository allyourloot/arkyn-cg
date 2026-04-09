import { gsap } from "gsap";
import {
    SETTLE_DELAY_MS,
    RAISE_DURATION_MS,
    BUBBLE_DURATION_MS,
    BUBBLE_STAGGER_MS,
    BUBBLE_TAIL_BUFFER_MS,
    DISSOLVE_DURATION_MS,
    DISSOLVE_STAGGER_MS,
} from "./timingConstants";
import { playCast, playPlaceRune, playCount, playDamage, playDiscard, playDissolve } from "../sfx";

// ============================================================
// GSAP timeline factories for the gameplay orchestrators
// ------------------------------------------------------------
// These build a single declarative `gsap.core.Timeline` for each of the
// cast / discard / draw flows. The timelines DO NOT tween any DOM elements
// directly — the per-flyer fly tweens live inside their respective
// component (`CastAnimation.tsx`, `DiscardAnimation.tsx`, `DrawAnimation.tsx`)
// via `useGSAP`. Each component's tween starts in the same frame the store
// state is mounted, so the two clocks stay aligned.
//
// What the timelines DO own:
//   1. SFX scheduling at exact moments (via `tl.call(playX, ..., timeS)`)
//   2. Store-state mutation callbacks (mounting dissolving runes, raising
//      slots, mounting damage bubbles, firing the enemy hit, cleanup)
//
// A module-level `currentCastTimeline` reference allows future interrupts
// to call `killCurrentCast()` and start a new timeline cleanly.
// ============================================================

const FLY_DURATION_S = 0.3;
const FLY_STAGGER_S = 0.06;
const PLACE_SFX_STAGGER_S = 0.1;
const DISCARD_FLY_DURATION_S = 0.4;
const DISCARD_STAGGER_S = 0.04;
const DRAW_FLY_DURATION_S = 0.45;
const DRAW_STAGGER_S = 0.06;

/**
 * Total wall-clock time the orchestrator timeline must wait for an N-flyer
 * staggered fly tween to fully complete. The last flyer starts at
 * `(N-1) * stagger` and runs for `duration` seconds, so the timeline
 * needs to wait `duration + (N-1) * stagger` total.
 */
function totalStaggeredDuration(count: number, perFlyerS: number, staggerS: number): number {
    return perFlyerS + Math.max(0, count - 1) * staggerS;
}

// Internal seconds-based mirrors of the public ms constants. Centralized
// here so the timeline math reads in the same units gsap expects.
const SETTLE_DELAY_S = SETTLE_DELAY_MS / 1000;
const RAISE_DURATION_S = RAISE_DURATION_MS / 1000;
const BUBBLE_DURATION_S = BUBBLE_DURATION_MS / 1000;
const BUBBLE_STAGGER_S = BUBBLE_STAGGER_MS / 1000;
const BUBBLE_TAIL_BUFFER_S = BUBBLE_TAIL_BUFFER_MS / 1000;
const DISSOLVE_DURATION_S = DISSOLVE_DURATION_MS / 1000;
const DISSOLVE_STAGGER_S = DISSOLVE_STAGGER_MS / 1000;

let currentCastTimeline: gsap.core.Timeline | null = null;
let currentDiscardTimeline: gsap.core.Timeline | null = null;
let currentDrawTimeline: gsap.core.Timeline | null = null;

// ----- Cast -----

export interface CastTimelineContext {
    /** Number of runes flying (drives the staggered fly window). */
    flyingCount: number;
    contributingCount: number;
    castRunesLength: number;
    /**
     * Running totals — index `i` is the cumulative damage AFTER the i-th
     * contributing rune's bubble has popped. Drives the live damage
     * counter in SpellPreview so the displayed number ticks up in lock-
     * step with the floating bubbles. Length === contributingCount.
     */
    cumulativeBubbleAmounts: readonly number[];
    /** Fired at t=0 — `flyingRunes` is mounted, HP locked. Plays cast SFX. */
    onStart: () => void;
    /** Fired when the fly tween completes. Mounts dissolving runes + sets dissolveStartTime. */
    onFlyComplete: () => void;
    /** Fired when slots should raise. Sets raisedSlotIndices. */
    onRaiseStart: () => void;
    /** Fired after the raise transition completes. Mounts runeDamageBubbles. */
    onBubblesStart: () => void;
    /**
     * Fired once per contributing rune in lockstep with its bubble +
     * count SFX. Receives the cumulative cast damage AFTER this rune's
     * contribution. SpellPreview pops its damage number on every call.
     */
    onCountTick: (cumulative: number) => void;
    /** Fired at the end of the dissolve. Sets enemyDamageHit + unlocks HP. */
    onImpact: () => void;
    /** Fired when the timeline finishes. Clears all animation state. */
    onComplete: () => void;
}

export function buildCastTimeline(ctx: CastTimelineContext): gsap.core.Timeline {
    // Defensive: kill any previous in-flight cast. The isAnimating() gate
    // in arkynAnimations.ts already prevents double-cast, but if a future
    // feature ever needs to interrupt mid-cast we want a clean slate.
    currentCastTimeline?.kill();

    // ----- Compute timeline anchor times (seconds) -----

    // Total wall-clock window the staggered per-flyer fly tween needs to
    // FULLY complete. Without accounting for the stagger, the orchestrator
    // would unmount the flyers before the last few finished animating —
    // visible as a "flash into place" on the trailing flyers.
    const flyTotalS = totalStaggeredDuration(ctx.flyingCount, FLY_DURATION_S, FLY_STAGGER_S);

    // Bubbles begin after the fly window, the settle hold, and the raise.
    const bubblesStartS = flyTotalS + SETTLE_DELAY_S + RAISE_DURATION_S;

    // Dissolve begins after the slots have raised and the bubble cascade has
    // played out — same instant the DissolveShader's RAF loop reads from its
    // wall-clock `dissolveStartTime`. Computed below once `raiseHoldS` exists.

    // Total time the slots stay raised (including the bubble cascade).
    // Identical math to the legacy raiseHoldMs formula in arkynAnimations.ts,
    // expressed in seconds.
    const lastBubbleDelayS = Math.max(0, ctx.contributingCount - 1) * BUBBLE_STAGGER_S;
    const raiseHoldS = RAISE_DURATION_S + (
        ctx.contributingCount > 0
            ? lastBubbleDelayS + BUBBLE_DURATION_S + BUBBLE_TAIL_BUFFER_S
            : BUBBLE_DURATION_S + BUBBLE_TAIL_BUFFER_S
    );

    // Dissolve starts the moment the raise hold finishes — this matches the
    // wall-clock `dissolveStartTime` set in arkynAnimations.ts so the SFX
    // lands on the same frame the shader begins eating the runes.
    const dissolveStartS = flyTotalS + SETTLE_DELAY_S + raiseHoldS;

    // Dissolve start (relative to fly-complete) is the same as the legacy
    // computation: settle + raise hold + per-rune dissolve stagger + dissolve duration.
    const impactAtS =
        dissolveStartS +
        Math.max(0, ctx.castRunesLength - 1) * DISSOLVE_STAGGER_S +
        DISSOLVE_DURATION_S;

    // ----- Build the timeline -----

    const tl = gsap.timeline({
        onComplete: () => {
            currentCastTimeline = null;
            ctx.onComplete();
        },
    });

    // t=0: fire cast SFX, mount flying runes, lock HP. The fly tweens
    // themselves live inside CastAnimation's useGSAP — they start in the
    // same frame this callback fires.
    tl.call(() => {
        playCast();
        ctx.onStart();
    }, undefined, 0);

    // Fly-complete: mount dissolving runes + set dissolveStartTime.
    tl.call(ctx.onFlyComplete, undefined, flyTotalS);

    // Place SFX staggered per contributing rune, starting at fly-complete.
    for (let i = 0; i < ctx.contributingCount; i++) {
        tl.call(playPlaceRune, undefined, flyTotalS + i * PLACE_SFX_STAGGER_S);
    }

    // Settle done: lift the valid slots.
    tl.call(ctx.onRaiseStart, undefined, flyTotalS + SETTLE_DELAY_S);

    // Raise transition done: mount the damage bubbles. Each bubble's own
    // delayMs (set by the orchestrator) staggers them in the DOM.
    tl.call(ctx.onBubblesStart, undefined, bubblesStartS);

    // Schedule one Count SFX + one count-tick callback per contributing
    // rune. Each pair fires in lockstep with its bubble — the SFX, the
    // visible bubble pop, and the live damage counter increment all land
    // on the same frame.
    for (let i = 0; i < ctx.contributingCount; i++) {
        const tickAt = bubblesStartS + i * BUBBLE_STAGGER_S;
        tl.call(playCount, undefined, tickAt);
        const cumulative = ctx.cumulativeBubbleAmounts[i] ?? 0;
        tl.call(() => ctx.onCountTick(cumulative), undefined, tickAt);
    }

    // Dissolve SFX — fires the instant the shader begins eating the runes.
    tl.call(playDissolve, undefined, dissolveStartS);

    // Impact: enemy floating damage + bar shake + HP unlock + damage SFX.
    tl.call(() => {
        playDamage();
        ctx.onImpact();
    }, undefined, impactAtS);

    currentCastTimeline = tl;
    return tl;
}

export function killCurrentCast(): void {
    currentCastTimeline?.kill();
    currentCastTimeline = null;
}

// ----- Discard -----

export interface DiscardTimelineContext {
    /** Number of runes being discarded (drives the staggered fly window). */
    flyingCount: number;
    /** Fired at t=0 — sends ARKYN_DISCARD message + clears state at the end. */
    onComplete: () => void;
}

export function buildDiscardTimeline(ctx: DiscardTimelineContext): gsap.core.Timeline {
    currentDiscardTimeline?.kill();

    const tl = gsap.timeline({
        onComplete: () => {
            currentDiscardTimeline = null;
            ctx.onComplete();
        },
    });

    // Discard is a single-phase animation: the runes fall and fade for the
    // total staggered duration, then we send the message + clear state.
    // The pure-callback timeline needs a duration anchor — we use a no-op
    // tween of the right length so the timeline times out correctly.
    const flyTotalS = totalStaggeredDuration(ctx.flyingCount, DISCARD_FLY_DURATION_S, DISCARD_STAGGER_S);
    tl.to({}, { duration: flyTotalS });

    // One discard SFX per discard action — not per rune. Multi-rune
    // discards layered too many overlapping shots into a muddy click.
    // playDiscard's built-in pitch randomization (±8%) keeps consecutive
    // discards from sounding identical across multiple actions.
    if (ctx.flyingCount > 0) {
        tl.call(playDiscard, undefined, 0);
    }

    currentDiscardTimeline = tl;
    return tl;
}

export function killCurrentDiscard(): void {
    currentDiscardTimeline?.kill();
    currentDiscardTimeline = null;
}

// ----- Draw -----

export interface DrawTimelineContext {
    /** Number of runes being drawn (drives the staggered fly window). */
    flyingCount: number;
    /** Fired at the end of the draw fly. Clears drawingRunes/drawingRuneIds. */
    onComplete: () => void;
}

export function buildDrawTimeline(ctx: DrawTimelineContext): gsap.core.Timeline {
    currentDrawTimeline?.kill();

    const tl = gsap.timeline({
        onComplete: () => {
            currentDrawTimeline = null;
            ctx.onComplete();
        },
    });

    // Same shape as discard — single-phase fly anchor sized to cover the
    // full staggered draw tween.
    const flyTotalS = totalStaggeredDuration(ctx.flyingCount, DRAW_FLY_DURATION_S, DRAW_STAGGER_S);
    tl.to({}, { duration: flyTotalS });

    currentDrawTimeline = tl;
    return tl;
}

export function killCurrentDraw(): void {
    currentDrawTimeline?.kill();
    currentDrawTimeline = null;
}

// Re-export the seconds versions of the fly durations + per-flyer stagger
// constants so the per-component fly tweens (CastAnimation/DiscardAnimation/
// DrawAnimation) can reference them and stay in sync with the orchestrator
// timeline. Sharing these values across the timeline factory and the
// per-flyer tweens ensures the orchestrator's fly window covers the entire
// staggered tween — so the trailing flyers always finish before the
// orchestrator unmounts them.
export {
    FLY_DURATION_S,
    FLY_STAGGER_S,
    DISCARD_FLY_DURATION_S,
    DISCARD_STAGGER_S,
    DRAW_FLY_DURATION_S,
    DRAW_STAGGER_S,
};
