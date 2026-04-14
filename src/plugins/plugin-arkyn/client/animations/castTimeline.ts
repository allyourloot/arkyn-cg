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
import { playCastRune, playCount, playDamage, playDiscard, playDissolve, playCritical } from "../sfx";

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
     * Per-contributing-rune damage breakdown — `base` is the value the
     * bubble shows (post-modifier for all runes). `final` equals `base`
     * (the two-pop bonus sequence has been removed).
     *
     * `isResisted` / `isCritical` flag the rune's elemental modifier so
     * the timeline plays the right SFX: pitched-down count for resists,
     * critical stinger for weakness hits.
     *
     * Length === contributingCount.
     */
    runeBreakdown: readonly {
        base: number;
        final: number;
        isResisted: boolean;
        isCritical: boolean;
        isProc: boolean;
        isSynapse?: boolean;
        multDelta?: number;
        /** Sigil ID that fired this event (procs + synapse). Drives onSigilShake dispatch. */
        sigilId?: string;
    }[];
    /**
     * Spell-tier base damage (SPELL_TIER_BASE_DAMAGE[tier]) — added to the
     * Base counter at t=0 so the chip starts at the spell's tier base and
     * each subsequent rune impact ticks on top of it. By the last rune
     * event the running cumulative equals spellBase + Σ runeBaseContributions
     * = the breakdown's baseTotal, matching the value the server applied.
     */
    spellBaseDamage: number;
    /**
     * Final post-mult damage (= breakdown.finalDamage). The timeline kicks
     * off a GSAP count-up tween that ramps the Total chip from 0 to this
     * value once all rune ticks have completed — Balatro-style dopamine
     * reveal. The orchestrator stores it in `castTotalDamage` via the
     * `onTotalReveal` callback below.
     */
    totalDamage: number;
    /** Fired at t=0 — `flyingRunes` is mounted, HP locked. Plays cast SFX.
     *  `dissolveDelayFromStartMs` is the wall-clock ms from NOW until the
     *  dissolve should begin. The caller mounts the dissolving runes here
     *  (with dissolveStartTime set that far in the future) so the
     *  DissolveCanvas has the full fly window to boot its WebGL context and
     *  decode textures BEFORE the flyer unmounts — without this pre-mount,
     *  the 1-3 frame texture-load gap at fly-complete shows as a visible
     *  flicker on the slot. PlayArea hides the dissolve layer until
     *  flyingRunes is empty. */
    onStart: (dissolveDelayFromStartMs: number) => void;
    /** Fired when the fly tween completes. Clears `flyingRunes` (revealing
     *  the pre-mounted dissolve canvases underneath) and sends the
     *  ARKYN_CAST message to the server. */
    onFlyComplete: () => void;
    /** Fired when slots should raise. Sets raisedSlotIndices. */
    onRaiseStart: () => void;
    /** Fired after the raise transition completes. Mounts runeDamageBubbles. */
    onBubblesStart: () => void;
    /**
     * Fired once per contributing rune at its bubble's appearance, with the
     * running cumulative Base total. SpellPreview pops its damage number
     * on every call.
     */
    onCountTick: (cumulative: number) => void;
    /**
     * Fired on every frame of the GSAP count-up tween that reveals the
     * Total chip after all rune ticks have completed. The orchestrator
     * stores the latest value in `castTotalDamage`. Called with `0` first
     * (start of tween) and ends at `totalDamage` exactly. While
     * `castTotalDamage` is the sentinel `-1` (never called), SpellPreview
     * shows "-".
     */
    onTotalReveal: (value: number) => void;
    /** Fired after the total reveal. Sets enemyDamageHit + unlocks HP. */
    onImpact: () => void;
    /** Fired when a sigil proc event occurs — shakes the sigil in the SigilBar. */
    onSigilShake?: (sigilId: string) => void;
    /** Fired when a Synapse event ticks the Mult counter. */
    onMultTick?: (mult: number) => void;
    /** Starting mult value (tier mult) — used to compute cumulative mult ticks. */
    baseMult?: number;
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

    // Total time the slots stay raised (including the bubble cascade).
    // Identical math to the legacy raiseHoldMs formula in arkynAnimations.ts,
    // expressed in seconds.
    const lastBubbleDelayS = Math.max(0, ctx.contributingCount - 1) * BUBBLE_STAGGER_S;
    const raiseHoldS = RAISE_DURATION_S + (
        ctx.contributingCount > 0
            ? lastBubbleDelayS + BUBBLE_DURATION_S + BUBBLE_TAIL_BUFFER_S
            : BUBBLE_DURATION_S + BUBBLE_TAIL_BUFFER_S
    );

    // Total reveal starts shortly after the last bubble pops in — the
    // player reads the number in ~300ms so we don't need to wait for the
    // full 750ms fade-out. This keeps the sequence punchy.
    const BUBBLE_READ_TIME_S = 0.3;
    const totalRevealStartS = bubblesStartS + lastBubbleDelayS + BUBBLE_READ_TIME_S;

    // Impact fires after the total reveal count-up finishes.
    const TOTAL_REVEAL_DURATION_S = 0.35;
    const impactAtS = totalRevealStartS + TOTAL_REVEAL_DURATION_S;

    // Dissolve starts after a pause for the impact animation to play out
    // (enemy floating damage + HP bar shake). The runes stay solid in the
    // play area until this moment — the shader keeps them intact because
    // dissolveStartTime is still in the future.
    const POST_IMPACT_PAUSE_S = 0.9;
    const dissolveStartS = impactAtS + POST_IMPACT_PAUSE_S;

    // ----- Build the timeline -----

    const tl = gsap.timeline({
        onComplete: () => {
            currentCastTimeline = null;
            ctx.onComplete();
        },
    });

    // t=0: fire cast-rune SFX, mount flying runes + pre-mount dissolving
    // runes (hidden), lock HP, and snap the Base counter to spellBase so
    // the SpellPreview chip reads the spell's tier base from the very first
    // frame (Balatro's "hand-type chips appear instantly when you press
    // play"). The fly tweens themselves live inside CastAnimation's useGSAP
    // — they start in the same frame this callback fires.
    const dissolveDelayFromStartMs = dissolveStartS * 1000;
    tl.call(() => {
        playCastRune();
        ctx.onStart(dissolveDelayFromStartMs);
        ctx.onCountTick(ctx.spellBaseDamage);
    }, undefined, 0);

    // Fly-complete: clear the flying runes so the pre-mounted dissolve
    // canvases (already rendering the intact rune while waiting for their
    // startTime) are revealed underneath. Also sends the ARKYN_CAST message.
    tl.call(ctx.onFlyComplete, undefined, flyTotalS);

    // Settle done: lift the valid slots.
    tl.call(ctx.onRaiseStart, undefined, flyTotalS + SETTLE_DELAY_S);

    // Raise transition done: mount the damage bubbles. Each bubble's own
    // delayMs (set by the orchestrator) staggers them in the DOM.
    tl.call(ctx.onBubblesStart, undefined, bubblesStartS);

    // Schedule the per-bubble SFX + count-tick callbacks. One event per
    // contributing rune at its staggered appearance time. Critical runes
    // play the critical stinger; resisted runes play a pitched-down count;
    // neutral runes play the normal count SFX.

    // Pitch for the count SFX on resisted appearance events. ~35% lower
    // playback rate gives a deep "thud" feel that clearly reads as a
    // weak hit.
    const RESISTED_COUNT_PITCH = 0.65;

    // Cumulative starts at the spell's tier base — the t=0 tick above
    // already pushed `spellBaseDamage` into the Base counter, so the
    // first per-rune event needs to add its delta on top of that, not
    // start fresh from zero.
    let runningCumulative = ctx.spellBaseDamage;
    let runningMult = ctx.baseMult ?? 0;
    for (let i = 0; i < ctx.contributingCount; i++) {
        const tickAt = bubblesStartS + i * BUBBLE_STAGGER_S;
        const item = ctx.runeBreakdown[i];
        if (!item) continue;

        // Hand-mult events (Synapse-style) don't tick the Base counter —
        // they add to Mult (already baked into finalDamage). Play SFX +
        // sigil shake + mult tick. sigilId drives dispatch generically.
        if (item.isSynapse) {
            runningMult += item.multDelta ?? 0;
            const multAtEvent = runningMult;
            const sigilId = item.sigilId;
            tl.call(playCount, undefined, tickAt);
            if (ctx.onSigilShake && sigilId) {
                tl.call(() => ctx.onSigilShake!(sigilId), undefined, tickAt);
            }
            if (ctx.onMultTick) {
                tl.call(() => ctx.onMultTick!(multAtEvent), undefined, tickAt);
            }
            continue;
        }

        runningCumulative += item.base;
        const cumulativeAtEvent = runningCumulative;
        if (item.isCritical) {
            tl.call(playCritical, undefined, tickAt);
        } else if (item.isResisted) {
            tl.call(() => playCount(RESISTED_COUNT_PITCH), undefined, tickAt);
        } else {
            tl.call(playCount, undefined, tickAt);
        }
        tl.call(() => ctx.onCountTick(cumulativeAtEvent), undefined, tickAt);
        // Proc events trigger a sigil shake in the SigilBar — sigilId
        // comes from the breakdown entry so dispatch is generic.
        if (item.isProc && ctx.onSigilShake && item.sigilId) {
            const sigilId = item.sigilId;
            tl.call(() => ctx.onSigilShake!(sigilId), undefined, tickAt);
        }
    }

    // Total chip count-up reveal — Balatro-style. Starts once all rune
    // ticks have completed (raise hold finished), then ramps from 0 →
    // totalDamage in ~0.5s for a snappy "number go up" payoff. The
    // orchestrator's `onTotalReveal` callback writes each frame's value
    // into `castTotalDamage`, and the Spell Preview switches the chip
    // from "-" to the live tween value as soon as the first frame fires.
    tl.call(() => {
        const tweenObj = { value: 0 };
        gsap.to(tweenObj, {
            value: ctx.totalDamage,
            duration: TOTAL_REVEAL_DURATION_S,
            ease: "power2.out",
            onUpdate: () => {
                ctx.onTotalReveal(Math.round(tweenObj.value));
            },
            onComplete: () => {
                // Snap to the exact target on the final frame so any
                // floating-point rounding error during the tween doesn't
                // leave the chip one off from the actual final damage.
                ctx.onTotalReveal(ctx.totalDamage);
            },
        });
    }, undefined, totalRevealStartS);

    // Impact: enemy floating damage + bar shake + HP unlock + damage SFX.
    // Fires after the total reveal count-up so the player sees the final
    // number before the enemy reacts.
    tl.call(() => {
        playDamage();
        ctx.onImpact();
    }, undefined, impactAtS);

    // Dissolve SFX — fires the instant the shader begins eating the runes
    // (after the impact animation has played out).
    tl.call(playDissolve, undefined, dissolveStartS);

    // Post-dissolve hold — wait for the dissolve animation to finish
    // before the timeline completes and the draw phase begins.
    const dissolveEndS =
        dissolveStartS +
        Math.max(0, ctx.castRunesLength - 1) * DISSOLVE_STAGGER_S +
        DISSOLVE_DURATION_S;
    tl.to({}, { duration: 0 }, dissolveEndS);

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
