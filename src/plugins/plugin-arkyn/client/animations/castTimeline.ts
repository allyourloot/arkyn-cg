import { gsap } from "gsap";
import {
    SETTLE_DELAY_MS,
    RAISE_DURATION_MS,
    BUBBLE_DURATION_MS,
    BUBBLE_STAGGER_MS,
    BUBBLE_TAIL_BUFFER_MS,
    DISSOLVE_DURATION_MS,
    DISSOLVE_STAGGER_MS,
} from "../arkynAnimations";
import { playCast, playPlaceRune, playCount, playDamage } from "../sfx";

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
const PLACE_SFX_STAGGER_S = 0.1;
const DISCARD_FLY_DURATION_S = 0.4;
const DRAW_FLY_DURATION_S = 0.45;

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
    contributingCount: number;
    castRunesLength: number;
    /** Fired at t=0 — `flyingRunes` is mounted, HP locked. Plays cast SFX. */
    onStart: () => void;
    /** Fired when the fly tween completes. Mounts dissolving runes + sets dissolveStartTime. */
    onFlyComplete: () => void;
    /** Fired when slots should raise. Sets raisedSlotIndices. */
    onRaiseStart: () => void;
    /** Fired after the raise transition completes. Mounts runeDamageBubbles. */
    onBubblesStart: () => void;
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

    // Bubbles begin after the settle hold AND the raise transition.
    const bubblesStartS = FLY_DURATION_S + SETTLE_DELAY_S + RAISE_DURATION_S;

    // Total time the slots stay raised (including the bubble cascade).
    // Identical math to the legacy raiseHoldMs formula in arkynAnimations.ts,
    // expressed in seconds.
    const lastBubbleDelayS = Math.max(0, ctx.contributingCount - 1) * BUBBLE_STAGGER_S;
    const raiseHoldS = RAISE_DURATION_S + (
        ctx.contributingCount > 0
            ? lastBubbleDelayS + BUBBLE_DURATION_S + BUBBLE_TAIL_BUFFER_S
            : BUBBLE_DURATION_S + BUBBLE_TAIL_BUFFER_S
    );

    // Dissolve start (relative to fly-complete) is the same as the legacy
    // computation: settle + raise hold + per-rune dissolve stagger + dissolve duration.
    const impactAtS =
        FLY_DURATION_S +
        SETTLE_DELAY_S +
        raiseHoldS +
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
    tl.call(ctx.onFlyComplete, undefined, FLY_DURATION_S);

    // Place SFX staggered per contributing rune, starting at fly-complete.
    for (let i = 0; i < ctx.contributingCount; i++) {
        tl.call(playPlaceRune, undefined, FLY_DURATION_S + i * PLACE_SFX_STAGGER_S);
    }

    // Settle done: lift the valid slots.
    tl.call(ctx.onRaiseStart, undefined, FLY_DURATION_S + SETTLE_DELAY_S);

    // Raise transition done: mount the damage bubbles. Each bubble's own
    // delayMs (set by the orchestrator) staggers them in the DOM.
    tl.call(ctx.onBubblesStart, undefined, bubblesStartS);

    // Schedule one Count SFX per contributing rune in lockstep with its bubble.
    for (let i = 0; i < ctx.contributingCount; i++) {
        tl.call(playCount, undefined, bubblesStartS + i * BUBBLE_STAGGER_S);
    }

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

    // Discard is a single-phase animation: the runes fall and fade for
    // DISCARD_FLY_DURATION_S, then we send the message + clear state.
    // We place a no-op tween of the right duration so the timeline has
    // something to time. (Pure-callback timelines need a duration anchor.)
    tl.to({}, { duration: DISCARD_FLY_DURATION_S });

    currentDiscardTimeline = tl;
    return tl;
}

export function killCurrentDiscard(): void {
    currentDiscardTimeline?.kill();
    currentDiscardTimeline = null;
}

// ----- Draw -----

export interface DrawTimelineContext {
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

    // Same shape as discard — single-phase fly anchor.
    tl.to({}, { duration: DRAW_FLY_DURATION_S });

    currentDrawTimeline = tl;
    return tl;
}

export function killCurrentDraw(): void {
    currentDrawTimeline?.kill();
    currentDrawTimeline = null;
}

// Re-export the seconds versions of the fly durations so the per-component
// fly tweens (CastAnimation/DiscardAnimation/DrawAnimation) can reference
// them and stay in sync with the orchestrator timeline.
export {
    FLY_DURATION_S,
    DISCARD_FLY_DURATION_S,
    DRAW_FLY_DURATION_S,
};
