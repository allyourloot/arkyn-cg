import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import {
    MAX_PLAY,
    ARKYN_CAST,
    ARKYN_DISCARD,
    resolveSpell,
    calculateDamage,
    getContributingRuneIndices,
} from "../shared";
import { subscribe, notify, type RuneClientData } from "./arkynStoreCore";
import { sendArkynMessage } from "./arkynNetwork";
// `arkynStoreInternal` is the data store's internal mutator/getter object.
// Importing it here is safe despite the cyclic appearance because every
// access happens inside a function body (call time, not module-eval time).
import { arkynStoreInternal } from "./arkynStore";
import {
    buildCastTimeline,
    buildDiscardTimeline,
    buildDrawTimeline,
} from "./animations/castTimeline";

// ----- Animation timing constants -----
//
// The actual numeric definitions live in `./animations/timingConstants` to
// break the circular import between this file and `castTimeline.ts` (which
// reads them at module-eval time and would otherwise see `undefined`). We
// re-export them here so external consumers — including the `arkynStore`
// barrel — keep their existing import paths.
export {
    DISSOLVE_DURATION_MS,
    DISSOLVE_STAGGER_MS,
    SETTLE_DELAY_MS,
    RAISE_DURATION_MS,
    BUBBLE_DURATION_MS,
    BUBBLE_STAGGER_MS,
    BUBBLE_TAIL_BUFFER_MS,
    ENEMY_DAMAGE_HIT_MS,
} from "./animations/timingConstants";
import {
    SETTLE_DELAY_MS,
    RAISE_DURATION_MS,
    BUBBLE_DURATION_MS,
    BUBBLE_STAGGER_MS,
    BUBBLE_TAIL_BUFFER_MS,
} from "./animations/timingConstants";

// Fly / discard / draw durations live inside `animations/castTimeline.ts`
// (in seconds, ready for GSAP). Component-level fly tweens reference them
// through `castTimeline`'s exports so the orchestrator timeline and the
// per-component tween clocks stay in sync.

// ----- Animation state types -----

// Per-slot floating damage numbers shown above raised runes during the cast
// hold. The spell element drives the stroke color so every bubble in a cast
// shares the same outline tint. Indexed BY SLOT INDEX so a non-contributing
// slot is `null`.
export interface RuneDamageBubble {
    amount: number;
    spellElement: string;
    /** Monotonically increasing — used as a React key so re-casts re-trigger CSS animation. */
    seq: number;
    /**
     * Per-bubble appearance delay (ms). Used as the CSS `animation-delay`
     * on both the bubble itself and the matching rune shake, so valid
     * runes get "counted" one after another in slot order.
     */
    delayMs: number;
}

// One-shot floating damage hit on the enemy health bar. `seq` increments on
// every cast so the EnemyHealthBar effect re-fires even when the same damage
// number is dealt twice in a row. `spellElement` drives the floating
// number's stroke color to match the cast that produced it.
export interface EnemyDamageHit {
    amount: number;
    spellElement: string;
    seq: number;
}

export interface FlyingRune {
    rune: RuneClientData;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    size: number;
    slotIndex: number;
}

export interface DiscardingRune {
    rune: RuneClientData;
    fromX: number;
    fromY: number;
    size: number;
}

export interface DrawingRune {
    rune: RuneClientData;
    toX: number;
    toY: number;
    size: number;
    handIndex: number;
}

// ----- Animation state -----

// Runes currently dissolving in the play area. Driven entirely by the client
// cast flow — server's playedRunes is no longer rendered.
let dissolvingRunes: RuneClientData[] = [];
let dissolveStartTime = 0;
// Slot indices (0-based, in display order) of the runes that actually
// contribute to the resolved spell. PlayArea lifts these slots so the player
// can see which of their played runes were "valid" for the cast before the
// dissolve animation tears them apart.
let raisedSlotIndices: number[] = [];
let runeDamageBubbles: (RuneDamageBubble | null)[] = [];
let bubbleSeqCounter = 0;
let enemyDamageHit: EnemyDamageHit = { amount: 0, spellElement: "", seq: 0 };
let enemyDamageSeqCounter = 0;

let flyingRunes: FlyingRune[] = [];
let isCastAnimating = false;
let discardingRunes: DiscardingRune[] = [];
let isDiscardAnimating = false;
let drawingRuneIds: string[] = [];
let drawingRunes: DrawingRune[] = [];

// Live damage counter that ticks up in lockstep with the per-rune damage
// bubbles during a cast. SpellPreview reads this and pops its damage number
// on every increment for a "number go up" dopamine effect. Reset to 0 at
// the start of every cast; reaches the final cast damage by the time the
// last bubble fires.
let castDamageCounter = 0;

// ----- Hooks -----
export function useDissolvingRunes() {
    return useSyncExternalStore(subscribe, () => dissolvingRunes);
}
export function useDissolveStartTime() {
    return useSyncExternalStore(subscribe, () => dissolveStartTime);
}
export function useRaisedSlotIndices() {
    return useSyncExternalStore(subscribe, () => raisedSlotIndices);
}
export function useRuneDamageBubbles() {
    return useSyncExternalStore(subscribe, () => runeDamageBubbles);
}
export function useEnemyDamageHit() {
    return useSyncExternalStore(subscribe, () => enemyDamageHit);
}
export function useFlyingRunes() {
    return useSyncExternalStore(subscribe, () => flyingRunes);
}
export function useIsCastAnimating() {
    return useSyncExternalStore(subscribe, () => isCastAnimating);
}
export function useDiscardingRunes() {
    return useSyncExternalStore(subscribe, () => discardingRunes);
}
export function useIsDiscardAnimating() {
    return useSyncExternalStore(subscribe, () => isDiscardAnimating);
}
export function useDrawingRuneIds() {
    return useSyncExternalStore(subscribe, () => drawingRuneIds);
}
export function useDrawingRunes() {
    return useSyncExternalStore(subscribe, () => drawingRunes);
}
export function useCastDamageCounter() {
    return useSyncExternalStore(subscribe, () => castDamageCounter);
}

// ----- Helpers -----

function isAnimating(): boolean {
    return isCastAnimating || isDiscardAnimating;
}

// ----- Orchestrators -----

export function triggerDrawAnimation(newRunes: { rune: RuneClientData; handIndex: number }[]) {
    if (newRunes.length === 0) return;

    // Mark IDs so HandDisplay can hide them
    drawingRuneIds = newRunes.map(r => r.rune.id);
    notify();

    // Wait a frame for the hand to render so we can read positions
    requestAnimationFrame(() => {
        const draws: DrawingRune[] = [];
        for (const { rune, handIndex } of newRunes) {
            const runeEl = document.querySelector(`[data-rune-index="${handIndex}"]`);
            if (runeEl) {
                const rect = runeEl.getBoundingClientRect();
                draws.push({
                    rune,
                    toX: rect.left + rect.width / 2,
                    toY: rect.top + rect.height / 2,
                    size: rect.width,
                    handIndex,
                });
            }
        }

        // flushSync forces React to commit before we build the orchestrator
        // timeline, so DrawAnimation's useGSAP fires (and the draw tween
        // starts) BEFORE the timeline's clock starts running. Same fix as
        // the cast/discard flows — without it the orchestrator could outrun
        // the tween.
        flushSync(() => {
            drawingRunes = draws;
            notify();
        });

        // GSAP timeline drives the post-fly cleanup. The component-level
        // useGSAP in DrawAnimation.tsx tweens the actual flyer DOM in the
        // same frame this state mounts. `flyingCount` sizes the fly window
        // so it covers the full staggered tween.
        buildDrawTimeline({
            flyingCount: draws.length,
            onComplete: () => {
                drawingRunes = [];
                drawingRuneIds = [];
                notify();
            },
        });
    });
}

export function castSpell() {
    const selectedRuneIds = arkynStoreInternal.getSelectedRuneIds();
    const selectedIndices = arkynStoreInternal.getSelectedIndices();
    if (selectedRuneIds.length === 0 || isAnimating()) return;

    const hand = arkynStoreInternal.getHand();

    // Capture DOM positions of selected runes and target slots (display order)
    const flying: FlyingRune[] = [];
    const sortedSelected = [...selectedIndices].sort((a, b) => a - b);

    for (let slotIdx = 0; slotIdx < sortedSelected.length; slotIdx++) {
        const handIdx = sortedSelected[slotIdx];
        const runeEl = document.querySelector(`[data-rune-index="${handIdx}"]`);
        const slotEl = document.querySelector(`[data-slot-index="${slotIdx}"]`);

        if (runeEl && slotEl) {
            const runeRect = runeEl.getBoundingClientRect();
            const slotRect = slotEl.getBoundingClientRect();

            flying.push({
                rune: hand[handIdx],
                fromX: runeRect.left + runeRect.width / 2,
                fromY: runeRect.top + runeRect.height / 2,
                toX: slotRect.left + slotRect.width / 2,
                toY: slotRect.top + slotRect.height / 2,
                size: runeRect.width,
                slotIndex: slotIdx,
            });
        }
    }

    const serverIndices = arkynStoreInternal.selectedIdsToServerIndices();

    // Captured ordered list of cast runes for the dissolve animation.
    const castRunes = sortedSelected
        .map(idx => hand[idx])
        .filter((r): r is RuneClientData => r !== undefined);

    if (flying.length === 0) {
        // Fallback: no DOM elements found, just send immediately
        sendArkynMessage(ARKYN_CAST, { selectedIndices: serverIndices });
        arkynStoreInternal.clearSelection();
        notify();
        return;
    }

    // Resolve the spell on the client so we can compute per-rune damage
    // for the floating bubble UI. Uses the same shared formula as the
    // server, with the synced enemy resistances/weaknesses, so the numbers
    // we display always sum to the actual damage that will be applied.
    const resolvedSpell = resolveSpell(castRunes.map(r => ({ element: r.element })));
    const totalDamage = resolvedSpell
        ? calculateDamage(
            resolvedSpell,
            arkynStoreInternal.getEnemyResistances(),
            arkynStoreInternal.getEnemyWeaknesses(),
        )
        : 0;

    // Pre-compute the contributing-rune info up front so the timeline
    // callbacks can mount the right state without re-deriving anything.
    const contributingIndices = getContributingRuneIndices(castRunes);
    const contributing = contributingIndices.length;
    // Per-rune damage = total / contributing, distributed evenly with any
    // remainder spread across the first few runes so the displayed numbers
    // always sum to exactly `totalDamage`.
    const perRuneBase = contributing > 0 ? Math.floor(totalDamage / contributing) : 0;
    const perRuneRemainder = contributing > 0 ? totalDamage - perRuneBase * contributing : 0;
    // The spell's primary element drives the outline color of every bubble
    // in this cast — and the matching enemy floating damage — so the
    // colorway reads as one cohesive spell impact.
    const spellElement = resolvedSpell?.element ?? "";
    const bubbles: (RuneDamageBubble | null)[] = new Array(MAX_PLAY).fill(null);
    // Cumulative damage values per bubble fire — index `i` is the running
    // total after the i-th contributing rune's bubble has popped. Drives
    // the live SpellPreview damage counter so it ticks 0 → final in lock-
    // step with the floating numbers.
    const cumulativeBubbleAmounts: number[] = [];
    let cumulativeAcc = 0;
    for (let i = 0; i < contributingIndices.length; i++) {
        const slotIdx = contributingIndices[i];
        const rune = castRunes[slotIdx];
        if (!rune) continue;
        const amount = perRuneBase + (i < perRuneRemainder ? 1 : 0);
        bubbles[slotIdx] = {
            amount,
            spellElement,
            seq: ++bubbleSeqCounter,
            // Each successive contributing rune's bubble waits its turn
            // so the damage reads like a counter ticking up.
            delayMs: i * BUBBLE_STAGGER_MS,
        };
        cumulativeAcc += amount;
        cumulativeBubbleAmounts.push(cumulativeAcc);
    }

    // Dynamic raise hold: long enough for the slot raise transition to
    // FIRST finish, then for the LAST staggered bubble to fully play out
    // (plus a small tail beat) before the dissolve tears the runes apart.
    // Identical math to what the timeline factory uses internally for SFX
    // scheduling — we recompute it here only for the dissolve-start time
    // that DissolveShader's wall-clock RAF loop reads.
    const lastBubbleDelayMs = Math.max(0, contributing - 1) * BUBBLE_STAGGER_MS;
    const raiseHoldMs =
        RAISE_DURATION_MS + (
            contributing > 0
                ? lastBubbleDelayMs + BUBBLE_DURATION_MS + BUBBLE_TAIL_BUFFER_MS
                : BUBBLE_DURATION_MS + BUBBLE_TAIL_BUFFER_MS
        );

    // Build the cast timeline. The timeline owns SFX scheduling and the
    // store-state mutation callbacks; the per-flyer fly tweens live inside
    // CastAnimation.tsx (started in the same frame `flyingRunes` is set).
    // `flyingCount` lets the timeline size its fly window to cover the
    // full staggered fly tween — without it, the trailing flyers would
    // be unmounted while still mid-flight.
    buildCastTimeline({
        flyingCount: flying.length,
        contributingCount: contributing,
        castRunesLength: castRunes.length,
        cumulativeBubbleAmounts,
        onStart: () => {
            // Mount the flyers and lock HP. flushSync forces React to
            // commit synchronously inside this callback so CastAnimation's
            // useGSAP fires (and the per-flyer fly tween starts) BEFORE
            // this function returns. Without flushSync, React would defer
            // the commit by 1-3 frames, leaving the orchestrator's clock
            // ahead of the fly tween's clock — which made the fly tween
            // get killed before completing its motion. The cast SFX fires
            // from the timeline's t=0 callback, before this runs.
            flushSync(() => {
                flyingRunes = flying;
                isCastAnimating = true;
                // Reset the live damage counter — it'll tick up with the
                // bubbles below. Starting at 0 reads as "calculating" and
                // makes the count-up payoff feel earned.
                castDamageCounter = 0;
                arkynStoreInternal.lockHpDisplay();
                arkynStoreInternal.clearSelection();
                arkynStoreInternal.setLastCastRunes(castRunes);
                notify();
            });
        },
        onCountTick: (cumulative) => {
            castDamageCounter = cumulative;
            notify();
        },
        onFlyComplete: () => {
            // Send the cast to the server (same instant as today — the
            // server's HP update arrives mid-animation but the bar stays
            // frozen via lockHpDisplay until the impact callback unlocks).
            sendArkynMessage(ARKYN_CAST, { selectedIndices: serverIndices });
            flyingRunes = [];
            // Mount the dissolving runes statically. The shader keeps them
            // intact through the settle + raise + bubble cascade because
            // dissolveStartTime is in the future.
            dissolvingRunes = castRunes;
            dissolveStartTime = performance.now() + SETTLE_DELAY_MS + raiseHoldMs;
            notify();
        },
        onRaiseStart: () => {
            raisedSlotIndices = contributingIndices;
            notify();
        },
        onBubblesStart: () => {
            runeDamageBubbles = bubbles;
            notify();
        },
        onImpact: () => {
            enemyDamageHit = {
                amount: totalDamage,
                spellElement,
                seq: ++enemyDamageSeqCounter,
            };
            // Release the HP bar lock and snap the displayed value to
            // whatever the server currently says.
            arkynStoreInternal.unlockHpDisplayAndSyncToServer();
            notify();
        },
        onComplete: () => {
            dissolvingRunes = [];
            dissolveStartTime = 0;
            raisedSlotIndices = [];
            runeDamageBubbles = [];
            isCastAnimating = false;
            notify();
        },
    });
}

export function discardRunes() {
    const selectedRuneIds = arkynStoreInternal.getSelectedRuneIds();
    const selectedIndices = arkynStoreInternal.getSelectedIndices();
    if (selectedRuneIds.length === 0 || isAnimating()) return;

    const hand = arkynStoreInternal.getHand();

    // Capture DOM positions of selected runes for animation (display order)
    const discs: DiscardingRune[] = [];
    for (const handIdx of selectedIndices) {
        const runeEl = document.querySelector(`[data-rune-index="${handIdx}"]`);
        if (runeEl) {
            const rect = runeEl.getBoundingClientRect();
            discs.push({
                rune: hand[handIdx],
                fromX: rect.left + rect.width / 2,
                fromY: rect.top + rect.height / 2,
                size: rect.width,
            });
        }
    }

    const serverIndices = arkynStoreInternal.selectedIdsToServerIndices();

    if (discs.length === 0) {
        sendArkynMessage(ARKYN_DISCARD, { selectedIndices: serverIndices });
        arkynStoreInternal.clearSelection();
        notify();
        return;
    }

    // flushSync forces React to commit before we build the orchestrator
    // timeline, so DiscardAnimation's useGSAP fires (and the discard tween
    // starts) BEFORE the timeline's clock starts running. Same fix as the
    // cast flow — without it the orchestrator could outrun the tween.
    flushSync(() => {
        discardingRunes = discs;
        isDiscardAnimating = true;
        arkynStoreInternal.clearSelection();
        notify();
    });

    // GSAP timeline drives the post-fly cleanup. The component-level
    // useGSAP in DiscardAnimation.tsx tweens the actual flyer DOM in the
    // same frame this state mounts. `flyingCount` sizes the fly window
    // so it covers the full staggered tween.
    buildDiscardTimeline({
        flyingCount: discs.length,
        onComplete: () => {
            sendArkynMessage(ARKYN_DISCARD, { selectedIndices: serverIndices });
            discardingRunes = [];
            isDiscardAnimating = false;
            notify();
        },
    });
}
