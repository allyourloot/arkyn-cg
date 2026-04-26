import { gsap } from "gsap";
import { type SlotPreviewKind, type RuneSpec } from "../../shared";
import { playDropRuneReverse } from "../sfx";
import { DISSOLVE_DURATION_MS } from "./timingConstants";

// =============================================================================
// Augury Picker — Apply + Exit timelines
// =============================================================================
// Pulled out of AuguryPicker.tsx so the picker file owns state + JSX while
// this file owns the GSAP choreography. Mirrors how the cast pipeline is
// split between `arkynAnimations.ts` (orchestrator) and `castTimeline.ts`
// (timeline factory).
//
// The two timelines are sequenced by the picker:
//   handleApply()
//     → buildAuguryApplyTimeline()        (flips / fades / pulses + materialize)
//     → onComplete fires
//     → buildAuguryExitTimeline()         (rune fly to pouch + bottom-UI slide)
//     → onComplete fires
//     → sendApplyTarot() over the wire    (server clears pending; picker unmounts)
//
// All durations are in seconds because GSAP tweens take seconds.
// =============================================================================

// --- Apply phase ---

/** rotateY 0 → 180 reveal. Used by convertElement / upgradeRarity / consecrate / wheelReroll. */
const ANIM_FLIP_S = 0.6;
/** Pulse: scale 1 → 1.3 → 1. Used by duplicate (Magician) for picked originals. */
const ANIM_PULSE_UP_S = 0.2;
const ANIM_PULSE_DOWN_S = 0.25;
/** Brief read-the-final-state hold before the exit slide kicks in. */
const ANIM_HOLD_S = 0.35;
/**
 * Stagger between consecutive per-rune apply SFX (select / dissolve)
 * so multi-rune tarots fire as a quick rhythmic cascade rather than
 * a single piled-up impact.
 */
const APPLY_SFX_STAGGER_S = 0.07;
/**
 * Settle window after the lifted slot's `runeSlotSelected` class is
 * removed — long enough for the rune slot's 120ms CSS transform
 * transition to finish so GSAP reads the lowered bounding rects when
 * the fly to the pouch begins.
 */
const ANIM_LOWER_SETTLE_S = 0.18;
/**
 * Fade slots use the shared DissolveCanvas (same shader the cast
 * pipeline uses to tear played runes apart). Held in lockstep with
 * the rest of the apply timeline.
 */
const ANIM_DISSOLVE_S = DISSOLVE_DURATION_MS / 1000;

// --- Exit phase ---

/** Fly to the pouch counter — power2.in for a satisfying "sucked in" feel. */
const EXIT_FLY_S = 0.55;
const EXIT_FLY_STAGGER_S = 0.04;
/** Bottom-UI slide-down (tarot row + element row + action panel). */
const EXIT_SLIDE_S = 0.3;
const EXIT_SLIDE_DROP_PX = 90;

// Reverse counterpart of DrawAnimation's rising scale (-300 cents stepping
// +100 per drawn rune): start the cascade up top and step DOWN so the
// fly back to the pouch reads as the draw arpeggio rewinding. Combined
// with the time-reversed SFX buffer (playDropRuneReverse), each rune's
// tap also plays backwards, doubling down on the "draw, but in reverse"
// feel.
const FLY_SFX_BASE_CENTS = 100;
const FLY_SFX_STEP_CENTS = -100;

/**
 * Default fallback target when the PouchCounter element isn't mounted
 * yet — bottom-right corner. The `[data-pouch-counter]` lookup fails
 * extremely rarely (only if the picker exits during a transition where
 * the counter is unmounted), but the fallback keeps the fly tween from
 * NaN-ing out.
 */
const FALLBACK_POUCH_OFFSET_PX = 60;

export interface AuguryAnimationRefs {
    /** Index-aligned with the picker's `runes[]` prop. Length === runes.length. */
    slots: (HTMLElement | null)[];
    /** Index-aligned with `slots`. Inner flipper div on each slot. */
    flippers: (HTMLElement | null)[];
    /** Ordered spawn slot wrappers (Lovers / World / Magician materialize here). */
    spawns: (HTMLElement | null)[];
    tarotRow: HTMLElement | null;
    elementRow: HTMLElement | null;
    actionPanel: HTMLElement | null;
}

export interface BuildAuguryApplyTimelineOpts {
    /** Per-slot animation map keyed by picker rune index. */
    anims: Map<number, SlotPreviewKind>;
    /** Spawned runes that materialize at apply time (Lovers / World / Magician). */
    spawned: readonly RuneSpec[];
    /**
     * Fired before the lower-settle delay. The picker uses this to flip
     * `loweredForExit` so the still-raised converted slots drop their
     * `runeSlotSelected` class — the slot's CSS transform transition
     * eases the lift + glow back into the row before the fly begins.
     * Without this, the class's `translateY(-14px) !important` would
     * override GSAP's `y` tween in the exit phase and the converted
     * runes would only fade in place while their neighbors fly home.
     */
    onLowerForExit: () => void;
    /** Fired when the apply timeline finishes. The picker chains the exit timeline here. */
    onComplete: () => void;
    /**
     * Per-rune SFX fired one-by-one at the start of the apply phase
     * with `APPLY_SFX_STAGGER_S` between each. Picker builds the list
     * from `anims` + `spawned` so each modified / added rune triggers
     * `playSelectRune` and each banished rune triggers `playDissolve`.
     * Empty list → no per-rune SFX (no rune-level visual cue to sync to).
     */
    applySfxCues?: readonly (() => void)[];
}

/**
 * Build the apply-phase timeline. Per-slot animations + spawned-rune hold
 * + a brief read-the-final-state hold + the lower-settle that drops
 * raised slots before the exit fly.
 *
 * Returns the GSAP timeline so callers can keep a handle to it; the
 * timeline starts playing immediately on creation (default GSAP behavior).
 */
export function buildAuguryApplyTimeline(
    refs: AuguryAnimationRefs,
    opts: BuildAuguryApplyTimelineOpts,
): gsap.core.Timeline {
    const tl = gsap.timeline({ onComplete: opts.onComplete });

    for (const [idx, anim] of opts.anims) {
        const slot = refs.slots[idx];
        const flipper = refs.flippers[idx];
        if (!flipper || !slot) continue;
        switch (anim.kind) {
            case "flip":
                tl.to(flipper, {
                    rotateY: 180,
                    duration: ANIM_FLIP_S,
                    ease: "back.out(1.4)",
                }, 0);
                break;
            case "fade":
                // Visual is owned by the inline DissolveCanvas mounted
                // in the slot's faceFront — GSAP just holds the timeline
                // open for the dissolve duration so onComplete fires
                // after the rune has finished tearing apart.
                tl.to({}, { duration: ANIM_DISSOLVE_S }, 0);
                break;
            case "pulse":
                tl.to(flipper, {
                    scale: 1.3,
                    duration: ANIM_PULSE_UP_S,
                    ease: "power2.out",
                }, 0);
                tl.to(flipper, {
                    scale: 1.0,
                    duration: ANIM_PULSE_DOWN_S,
                    ease: "power2.in",
                }, ANIM_PULSE_UP_S);
                break;
        }
    }

    // Per-rune apply SFX, scheduled at the very start of the timeline
    // with a short stagger so multi-rune tarots cascade audibly.
    if (opts.applySfxCues) {
        for (let i = 0; i < opts.applySfxCues.length; i++) {
            const fn = opts.applySfxCues[i];
            tl.call(fn, undefined, i * APPLY_SFX_STAGGER_S);
        }
    }

    // If any runes are spawning (World, Lovers, Magician), hold the
    // timeline open for the reverse-dissolve duration so the materialize
    // can play to completion.
    if (opts.spawned.length > 0) {
        tl.to({}, { duration: ANIM_DISSOLVE_S }, 0);
    }

    // Brief hold so the player can read the final state before the
    // picker slides out.
    tl.to({}, { duration: ANIM_HOLD_S });

    // Drop the still-raised converted slots back to their resting
    // position. See the `onLowerForExit` callback comment for why.
    tl.call(opts.onLowerForExit);
    tl.to({}, { duration: ANIM_LOWER_SETTLE_S });

    return tl;
}

export interface BuildAuguryExitTimelineOpts {
    /** Same map the apply timeline received. Used to skip fade slots in the fly. */
    anims: Map<number, SlotPreviewKind>;
    /** Same spawned list the apply timeline received. */
    spawned: readonly RuneSpec[];
    /** Total picker rune count (refs.slots.length). */
    runeCount: number;
    /**
     * Fired one frame after the bottom UI slide completes. The picker
     * uses this to lock the bottom UI invisible via CSS class — needed
     * because the schema-sync that follows `onComplete` re-renders the
     * picker with empty arrays and an inline opacity:0 alone wouldn't
     * survive the layout reflow.
     */
    onBottomUIExited: () => void;
    /** Fired when the exit timeline finishes. The picker sends the apply message here. */
    onComplete: () => void;
}

/**
 * Build the exit-phase timeline. Picker runes + spawned runes fly to
 * the pouch counter; bottom UI slides down in parallel; on completion
 * the picker fires its message and unmounts via schema sync.
 */
export function buildAuguryExitTimeline(
    refs: AuguryAnimationRefs,
    opts: BuildAuguryExitTimelineOpts,
): gsap.core.Timeline {
    const pouchCenter = readPouchCounterCenter();
    const tl = gsap.timeline({ onComplete: opts.onComplete });

    let flyOrder = 0;

    // Fly each surviving picker rune to the pouch. Skip dissolved
    // (fade) slots — they're already gone visually.
    for (let i = 0; i < opts.runeCount; i++) {
        if (opts.anims.get(i)?.kind === "fade") continue;
        flyOrder = appendFlyTween(tl, refs.slots[i], pouchCenter, flyOrder);
    }

    // Fly spawned runes (World, Lovers, Magician) — they materialized
    // in the row during apply and now return to the pouch alongside
    // their kin.
    for (let i = 0; i < opts.spawned.length; i++) {
        flyOrder = appendFlyTween(tl, refs.spawns[i], pouchCenter, flyOrder);
    }

    // Bottom-UI slide-down. Tarots, element row, and action panel all
    // leave together so the lower half of the picker exits as a single
    // coordinated motion in parallel with the rune fly.
    for (const target of [refs.tarotRow, refs.elementRow, refs.actionPanel]) {
        if (!target) continue;
        tl.to(target, {
            y: EXIT_SLIDE_DROP_PX,
            opacity: 0,
            duration: EXIT_SLIDE_S,
            ease: "power2.in",
        }, 0);
    }

    // Once the slide is done, lock the bottom UI invisible via CSS
    // class. See `onBottomUIExited` callback comment for the reflow story.
    tl.call(opts.onBottomUIExited, undefined, EXIT_SLIDE_S);

    // Safety floor — guarantees onComplete fires even when no flyers
    // and no slide targets exist (shouldn't happen, but defensive).
    tl.to({}, { duration: 0.05 });

    return tl;
}

interface ScreenPoint { x: number; y: number; }

function readPouchCounterCenter(): ScreenPoint {
    const pouchEl = document.querySelector("[data-pouch-counter]") as HTMLElement | null;
    const pouchRect = pouchEl?.getBoundingClientRect();
    if (pouchRect) {
        return {
            x: pouchRect.left + pouchRect.width / 2,
            y: pouchRect.top + pouchRect.height / 2,
        };
    }
    return {
        x: window.innerWidth - FALLBACK_POUCH_OFFSET_PX,
        y: window.innerHeight - FALLBACK_POUCH_OFFSET_PX,
    };
}

/**
 * Append a single fly-to-pouch tween to `tl`. Returns the next flyOrder
 * to use. Replaces the two near-identical fly-tween blocks the picker
 * had inline (one for picker runes, one for spawned runes) — both are
 * the same animation; the only difference was the source ref array.
 */
function appendFlyTween(
    tl: gsap.core.Timeline,
    slot: HTMLElement | null,
    pouchCenter: ScreenPoint,
    flyOrder: number,
): number {
    if (!slot) return flyOrder;

    const slotRect = slot.getBoundingClientRect();
    const dx = pouchCenter.x - (slotRect.left + slotRect.width / 2);
    const dy = pouchCenter.y - (slotRect.top + slotRect.height / 2);

    // Disable the slot's CSS transition so it doesn't fight the GSAP
    // per-frame transform writes during the fly.
    slot.style.transition = "none";

    const cents = FLY_SFX_BASE_CENTS + flyOrder * FLY_SFX_STEP_CENTS;
    tl.to(slot, {
        x: dx,
        y: dy,
        scale: 0.18,
        opacity: 0,
        duration: EXIT_FLY_S,
        ease: "power2.in",
        onStart: () => playDropRuneReverse(cents),
    }, flyOrder * EXIT_FLY_STAGGER_S);

    return flyOrder + 1;
}
