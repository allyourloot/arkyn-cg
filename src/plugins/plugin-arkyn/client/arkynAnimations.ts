import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import {
    ARKYN_CAST,
    ARKYN_DISCARD,
    SIGIL_DISCARD_HOOKS,
    SIGIL_CAST_HOOKS,
    SPELL_TIER_MULT,
    expandMimicSigilsDetailed,
} from "../shared";
import { subscribe, notify, type RuneClientData } from "./arkynStoreCore";
import { sendArkynMessage } from "./arkynNetwork";
// `arkynStoreInternal` is the data store's internal mutator/getter object.
// Importing it here is safe despite the cyclic appearance because every
// access happens inside a function body (call time, not module-eval time).
import {
    arkynStoreInternal,
    appendHandRune,
    appendAcquiredRune,
    setMaterializingRune,
} from "./arkynStore";
import {
    buildCastTimeline,
    buildDiscardTimeline,
    buildDrawTimeline,
} from "./animations/castTimeline";
import { assembleCastBreakdown } from "./animations/castBreakdown";

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
    RAISE_LIFT_PX,
    SLOT_RAISE_S,
    SLOT_LOWER_S,
    BAR_SHAKE_FRAME_S,
    RUNE_SHAKE_FRAME_S,
} from "./animations/timingConstants";
import {
    DISSOLVE_DURATION_MS,
    BANISH_SIGIL_REACT_DELAY_MS,
    BANISH_GOLD_COMMIT_DELAY_MS,
    BANISH_CLEANUP_EXTRA_MS,
} from "./animations/timingConstants";
import { playBell, playBlackjack, playGold, playAddConsumable } from "./sfx";
import { BLACKJACK_ANIMATION_TOTAL_MS } from "./ui/BlackjackAnimation";

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
    /** Final per-rune damage AFTER the elemental modifier (resistance / weakness). */
    amount: number;
    /** Display value — always equals `amount` (kept for API compat). */
    baseAmount: number;
    spellElement: string;
    /** Whether this rune hit a weakness — shows the critical burst behind the number. */
    isCritical: boolean;
    /** Whether this rune hit a resistance — tints the number light red. */
    isResisted: boolean;
    /** Monotonically increasing — used as a React key so re-casts re-trigger CSS animation. */
    seq: number;
    /**
     * Per-bubble appearance delay (ms). Used as the CSS `animation-delay`
     * on both the bubble itself and the matching rune shake, so valid
     * runes get "counted" one after another in slot order.
     */
    delayMs: number;
    /**
     * Variant discriminator. Default ("damage") renders the number with
     * the damage stroke/outline styling. `"gold"` renders "+N Gold" in
     * the coin-yellow color — used by Fortune-style grant_gold procs.
     */
    kind?: "damage" | "gold";
}

// One-shot floating damage hit on the enemy health bar. `seq` increments on
// every cast so the EnemyHealthBar effect re-fires even when the same damage
// number is dealt twice in a row. `spellElement` drives the floating
// number's stroke color to match the cast that produced it.
export interface EnemyDamageHit {
    amount: number;
    spellElement: string;
    isCritical: boolean;
    /**
     * True if Blackjack's execute proc fired this cast. The EnemyHealthBar
     * swaps the critical-burst background for the execute-burst variant
     * (same shape, different colors) so the kill reads as an execution
     * rather than a normal big crit. The numeric `amount` stays equal to
     * the actual damage dealt — the execute flair is purely visual.
     */
    isExecute: boolean;
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

// Runes currently dissolving in the play area. Driven entirely by the
// client cast flow — the render pipeline never reads played runes from
// the server.
let dissolvingRunes: RuneClientData[] = [];
let dissolveStartTime = 0;
// Slot indices (0-based, in display order) of the runes that actually
// contribute to the resolved spell. PlayArea lifts these slots so the player
// can see which of their played runes were "valid" for the cast before the
// dissolve animation tears them apart.
let raisedSlotIndices: number[] = [];
let runeDamageBubbles: (RuneDamageBubble | null)[] = [];
let enemyDamageHit: EnemyDamageHit = { amount: 0, spellElement: "", isCritical: false, isExecute: false, seq: 0 };
let enemyDamageSeqCounter = 0;

let flyingRunes: FlyingRune[] = [];
let isCastAnimating = false;
// IDs of the runes currently being cast — used by HandDisplay to keep their
// hand slots hidden for the entire cast sequence (fly → dissolve → impact),
// since the server's hand update is now deferred until the cast finishes.
let castingRuneIds: string[] = [];
let discardingRunes: DiscardingRune[] = [];
let isDiscardAnimating = false;
// Runes currently being banished (Banish sigil consumed the first solo
// discard of the round). Rendered by BanishAnimation at the captured
// hand-slot position via DissolveCanvas — the rune tears apart in place
// instead of sliding off-screen. `banishStartTime` is set to
// `performance.now()` on trigger so the dissolve shader's `uThreshold`
// advances from the exact frame the flyer mounts.
let banishingRunes: DiscardingRune[] = [];
let banishStartTime = 0;
let isBanishAnimating = false;
// Rune IDs currently dissolving in the banish flyer layer. HandDisplay
// reads this list to keep the original hand-slot rune hidden while the
// flyer plays, so the dissolving image isn't painted on top of an
// identical intact hand rune during the brief window before the server
// sync removes it from `hand`.
let banishingRuneIds: string[] = [];
let drawingRuneIds: string[] = [];
let drawingRunes: DrawingRune[] = [];

// Live BASE counter for the Spell Preview's Base + Mult chip pair. Ticks
// up in lockstep with the per-rune damage bubbles during a cast: starts at
// the spell's tier base (set by an initial timeline tick at t=0), then
// each rune impact adds its post-modifier base contribution. SpellPreview
// reads this and pops its Base number on every increment for a Balatro-
// style "number go up" effect. Reset to 0 at the start of every cast.
//
// The MULT counter ticks up during synapse events (held Psy runes adding
// +2 Mult each). Starts at the spell's tier mult, then increments per
// synapse bubble. `-1` is the sentinel meaning "use static tier mult".
let castMultCounter = -1;
let castBaseCounter = 0;

// Live TOTAL counter for the current cast's GSAP count-up tween. `-1` is
// the sentinel meaning "not yet revealed" — while it's negative, the
// tween hasn't started yet. The cast timeline ramps this from 0 → the
// cast's finalDamage in ~0.5s for a Balatro-style dopamine reveal.
let castTotalDamage = -1;

// Cumulative damage dealt across all casts in the current round. The
// Spell Preview's red TOTAL chip shows this so the player can track
// progress toward the enemy's HP. Reset to 0 on round transitions.
let roundTotalDamage = 0;

// Snapshot of the last resolved cast's BASE total (spellBase + Σ rune
// contributions). Set when a cast resolves so the Spell Preview's "Last
// Cast" view can render the post-cast Base value without re-running the
// formula against potentially-stale enemy state. The corresponding total
// can be derived as `lastCastBaseDamage × mult` from the resolved spell.
let lastCastBaseDamage = 0;

// ----- Sigil proc state -----
// Proc damage bubbles — per-slot ARRAY of bubbles. Each slot holds the
// ordered list of procs that fired on its rune (empty = none). Multi-
// proc scenarios (e.g. Mimic copying Chainlink to stack two retriggers
// per rune) push multiple bubbles here so PlayArea can render one
// `<RuneDamageBubble>` per entry, each with its own staggered delayMs
// so the pops sequence visually instead of overlapping into a single
// bubble.
let procDamageBubbles: RuneDamageBubble[][] = [];
// Monotonic seq for sigil shake events — forces remount on every proc.
let sigilShakeSeq = 0;
// Active sigil shake event — SigilBar reads this to animate the matching icon.
let activeSigilShake: { sigilId: string; seq: number } | null = null;

// Synapse sigil — mult bubbles shown on held Psy runes in the hand during
// cast. Per-slot ARRAY indexed by HAND INDEX so Mimic-stacked Synapse
// copies stagger on the same rune (one bubble per Synapse invocation per
// matching held rune).
export interface HandMultBubble {
    amount: number;     // e.g. 2 for "+2 Mult"
    seq: number;
    delayMs: number;
}
let handMultBubbles: HandMultBubble[][] = [];

// Big Bang — floating "x{factor}" bubbles shown over contributing runes in
// the PLAY AREA as the cumulative xMult events resolve. Per-slot ARRAY
// (parallel to `procDamageBubbles`) so multi-factor Big Bang casts stagger
// across the contributing runes instead of collapsing onto a single slot.
export interface RuneXMultBubble {
    factor: number;     // e.g. 1.5 for "x1.5"
    seq: number;
    delayMs: number;
}
let runeXMultBubbles: RuneXMultBubble[][] = [];

// Clairvoyant — floating "x{factor}" bubbles shown over HELD runes in the
// hand when a held-element xMult sigil procs. Per-slot ARRAY indexed by
// HAND INDEX so Mimic-stacked copies stagger on the same rune (one bubble
// per Clairvoyant invocation per matching held rune).
let heldXMultBubbles: RuneXMultBubble[][] = [];

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
export function useCastingRuneIds() {
    return useSyncExternalStore(subscribe, () => castingRuneIds);
}
export function useDiscardingRunes() {
    return useSyncExternalStore(subscribe, () => discardingRunes);
}
export function useIsDiscardAnimating() {
    return useSyncExternalStore(subscribe, () => isDiscardAnimating);
}
export function useBanishingRunes() {
    return useSyncExternalStore(subscribe, () => banishingRunes);
}
export function useBanishStartTime() {
    return useSyncExternalStore(subscribe, () => banishStartTime);
}
export function useBanishingRuneIds() {
    return useSyncExternalStore(subscribe, () => banishingRuneIds);
}
export function useDrawingRuneIds() {
    return useSyncExternalStore(subscribe, () => drawingRuneIds);
}
export function useDrawingRunes() {
    return useSyncExternalStore(subscribe, () => drawingRunes);
}
export function useCastBaseCounter() {
    return useSyncExternalStore(subscribe, () => castBaseCounter);
}
export function useCastMultCounter() {
    return useSyncExternalStore(subscribe, () => castMultCounter);
}
export function useCastTotalDamage() {
    return useSyncExternalStore(subscribe, () => castTotalDamage);
}
export function useLastCastBaseDamage() {
    return useSyncExternalStore(subscribe, () => lastCastBaseDamage);
}
export function useRoundTotalDamage() {
    return useSyncExternalStore(subscribe, () => roundTotalDamage);
}
export function useProcDamageBubbles() {
    return useSyncExternalStore(subscribe, () => procDamageBubbles);
}
export function useActiveSigilShake() {
    return useSyncExternalStore(subscribe, () => activeSigilShake);
}
export function useHandMultBubbles() {
    return useSyncExternalStore(subscribe, () => handMultBubbles);
}
export function useRuneXMultBubbles() {
    return useSyncExternalStore(subscribe, () => runeXMultBubbles);
}
export function useHeldXMultBubbles() {
    return useSyncExternalStore(subscribe, () => heldXMultBubbles);
}

// ----- Helpers -----

function isAnimating(): boolean {
    return isCastAnimating || isDiscardAnimating || isBanishAnimating;
}

/**
 * Imperative read of the cast animation flag, for non-React callers (e.g.
 * the Colyseus state sync system, which needs to know whether to defer a
 * server-driven hand update until the cast sequence finishes).
 */
export function getIsCastAnimating(): boolean {
    return isCastAnimating;
}

/**
 * Clears the `castingRuneIds` set. Called by the sync system in the same
 * synchronous batch as `setHand`, so the remaining hand cards' slid-left
 * GSAP transforms can snap to x=0 in lockstep with the new flex layout.
 */
export function clearCastingRuneIds(): void {
    if (castingRuneIds.length === 0) return;
    castingRuneIds = [];
    notify();
}

/**
 * Wipe the Spell Preview's "Last Cast" state so a new round starts with a
 * clean preview panel. Called by the sync system when the round number
 * increments (shop → next round). Without this, `lastCastRunes` from the
 * previous round's final cast would keep the panel showing "Last Cast"
 * until the player selects a new rune.
 */
export function clearLastCastState(): void {
    lastCastBaseDamage = 0;
    castBaseCounter = 0;
    castMultCounter = -1;
    castTotalDamage = -1;
    roundTotalDamage = 0;
    procDamageBubbles = [];
    handMultBubbles = [];
    runeXMultBubbles = [];
    heldXMultBubbles = [];
    activeSigilShake = null;
    arkynStoreInternal.setLastCastRunes([]);
    notify();
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

    // ----- Cast-hook prediction (Magic Mirror et al.) -----
    // Run SIGIL_CAST_HOOKS client-side with the SAME inputs the server
    // will see. The hook is pure, so the server's subsequent dispatch
    // produces identical effects. We ONLY collect the resulting proc info
    // here; state mutations (appending the duplicate into hand +
    // acquiredRunes, sigil shake, materialize, pop SFX) are deferred to
    // the cast-timeline's `onFlyComplete` so the duplicate visibly
    // appears the moment the played rune reaches the play area — not on
    // cast click. Server dispatches the same hook AFTER refillHand, so
    // the timing lines up: neither the server's damage calc nor the
    // client's assembleCastBreakdown includes the duplicate in hand-mult
    // calculations for THIS cast, and both calculations agree byte-for-
    // byte. Hand-mult sigils (Synapse) will count the duplicate on
    // FUTURE casts where it's actually held in the hand.
    const ownedSigilsForPrediction = arkynStoreInternal.getSigils();
    const castsUsedSoFar = arkynStoreInternal.getCastsUsedThisRound();
    const predictedCastContext = {
        castNumber: castsUsedSoFar + 1,
        runeCount: castRunes.length,
        runes: castRunes.map(r => ({
            id: r.id,
            element: r.element,
            rarity: r.rarity,
            level: r.level,
        })),
    };
    const pendingMirrorProcs: { duplicate: RuneClientData; sigilId: string; isMimicCopy: boolean }[] = [];
    // `expandMimicSigilsDetailed` mirrors the server's handleCast dispatcher —
    // when a Mimic sits next to a Mimic-compatible cast hook, the hook fires
    // twice (once for the original sigil, once for the Mimic copy). The
    // copyIndex is mixed into the synthesized duplicate id so the two
    // runes have distinct ids matching the server's scheme.
    for (const entry of expandMimicSigilsDetailed(ownedSigilsForPrediction)) {
        const hook = SIGIL_CAST_HOOKS[entry.sigilId];
        if (!hook?.onCast) continue;
        const effects = hook.onCast(predictedCastContext);
        if (!effects || effects.length === 0) continue;
        for (const effect of effects) {
            if (effect.type !== "duplicateRune") continue;
            const source = predictedCastContext.runes[effect.runeIndex];
            if (!source) continue;
            pendingMirrorProcs.push({
                duplicate: {
                    id: `mirror-${source.id}-${entry.copyIndex}`,
                    element: source.element,
                    rarity: source.rarity,
                    level: source.level,
                },
                sigilId: entry.sigilId,
                isMimicCopy: entry.isMimicCopy,
            });
        }
    }
    // assembleCastBreakdown below runs on the UNMODIFIED hand (no
    // duplicate yet) — matching the server's damage-calc input.
    const predictionHand = hand;
    const predictionSortedSelected = sortedSelected;

    // Assemble the full cast breakdown (resolver, composed modifiers, damage
    // formula, proc iteration, per-slot bubble arrays, and the flat
    // `runeBreakdown[]` event list the timeline consumes). Magic Mirror
    // duplicates are NOT in hand here — they're appended at fly-complete,
    // matching the server's post-refill dispatch timing — so hand-mult
    // sigils don't count the duplicate for THIS cast's damage (server and
    // client agree). The duplicate influences future casts only.
    const {
        runeBreakdown,
        bubbles,
        procBubblesForCast,
        xMultBubblesForCast,
        handMultBubblesForCast,
        heldXMultBubblesForCast,
        resolvedSpell,
        contributingIndices,
        totalDamage,
        spellBaseDamage,
        baseTotal,
        hasCritical,
        hasAnyProc,
        hasAnyExecute,
        hasAnyMultEvent,
        hasAnyAccumulatorInc,
        hasAnySpellXMult,
        spellElement,
    } = assembleCastBreakdown({
        castRunes,
        hand: predictionHand,
        sortedSelected: predictionSortedSelected,
    });

    // Snapshot the round accumulator BEFORE this cast so the total reveal
    // tween can offset its values. This avoids the double-counting window
    // that would occur if the display added roundTotalDamage + castTotalDamage
    // while onImpact has already bumped roundTotalDamage.
    const previousRoundTotal = roundTotalDamage;

    // Build the cast timeline. The timeline owns SFX scheduling and the
    // store-state mutation callbacks; the per-flyer fly tweens live inside
    // CastAnimation.tsx (started in the same frame `flyingRunes` is set).
    // `flyingCount` lets the timeline size its fly window to cover the
    // full staggered fly tween — without it, the trailing flyers would
    // be unmounted while still mid-flight.
    // The extended event count includes proc entries interleaved after their
    // parent runes. The timeline uses this for timing the bubble cascade
    // and the total reveal.
    const extendedEventCount = runeBreakdown.length;

    // When Blackjack's execute proc fires, we capture the trigger
    // timestamp here so onImpact (below) can defer the floating damage
    // hit until after the spritesheet's fade-out completes. Stays 0 if
    // no execute fires this cast — onImpact treats 0 as "not deferred".
    let executeTriggerTime = 0;

    buildCastTimeline({
        flyingCount: flying.length,
        contributingCount: extendedEventCount,
        castRunesLength: castRunes.length,
        runeBreakdown,
        spellBaseDamage,
        totalDamage,
        onStart: (dissolveDelayFromStartMs: number) => {
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
                // Mark these IDs as "currently casting" so HandDisplay keeps
                // their slots hidden for the full cast sequence. Without
                // this, the deferred server hand-sync would leave the played
                // runes visible in the hand until the dissolve completes.
                castingRuneIds = castRunes.map(r => r.id);
                // Pre-mount the dissolving runes (hidden by PlayArea while
                // flyingRunes is non-empty). dissolveStartTime is set far
                // in the future so the shader renders the intact rune the
                // whole time until the real dissolve kicks in. By the time
                // the flyers unmount at fly-complete, the DissolveCanvas
                // has booted its WebGL context + loaded textures + painted
                // its first frame — no flicker on the handoff.
                dissolvingRunes = castRunes;
                dissolveStartTime = performance.now() + dissolveDelayFromStartMs;
                // Reset the live Base counter — it'll tick up with the
                // bubbles below. Starting at 0 reads as "calculating"; the
                // timeline's initial t=0 tick snaps it up to spellBase
                // immediately so the chip starts at the spell's tier base.
                castBaseCounter = 0;
                // Reset the Mult counter — starts at tier mult, ticks
                // up during synapse events.
                castMultCounter = -1;
                // Sentinel-reset the Total counter to "hidden" so the
                // chip shows "-" until the timeline's count-up reveal
                // tween fires (after all rune ticks have completed).
                castTotalDamage = -1;
                // Snapshot the resolved Base total so the Spell Preview's
                // "Last Cast" view can render the post-cast Base value
                // without re-running the formula against (potentially
                // stale) enemy state after a round transition.
                lastCastBaseDamage = baseTotal;
                arkynStoreInternal.lockHpDisplay();
                // Freeze the gold counter at its pre-cast value. Fortune-style
                // procs will tick it up per event via `addDisplayedGold`;
                // the server's schema patch (which arrives almost instantly
                // when the cast message is sent at fly-complete) won't
                // jump the counter ahead of the animation.
                arkynStoreInternal.lockGoldDisplay();
                arkynStoreInternal.clearSelection();
                arkynStoreInternal.setLastCastRunes(castRunes);
                notify();
            });
        },
        onCountTick: (cumulative) => {
            castBaseCounter = cumulative;
            notify();
        },
        onTotalReveal: (value) => {
            // Offset by the prior round total so castTotalDamage already
            // includes cumulative round damage — SpellPreview can display
            // it directly without adding roundTotalDamage on top.
            castTotalDamage = previousRoundTotal + value;
            notify();
        },
        onFlyComplete: () => {
            // Send the cast to the server (same instant as today — the
            // server's HP update arrives mid-animation but the bar stays
            // frozen via lockHpDisplay until the impact callback unlocks).
            sendArkynMessage(ARKYN_CAST, { selectedIndices: serverIndices });
            // Clearing the flyers reveals the dissolving runes that were
            // pre-mounted in onStart. They've been rendering the intact
            // rune this whole time (dissolveStartTime is still in the
            // future), so the handoff is seamless.
            flyingRunes = [];

            // Fire the deferred Magic Mirror proc UX — at this point the
            // played rune has just reached the play area, so the player
            // is primed to read the duplicate's entrance as the sigil's
            // reaction to the cast. Sequence per proc:
            //   1. Set `materializingRune` BEFORE the hand mutates so
            //      HandDisplay renders the new slot via
            //      `<DissolveCanvas reverse>` the frame it arrives.
            //   2. Append the duplicate to hand + acquiredRunes. Hand
            //      grows past handSize (e.g. 8 → 9) — `refillHand`
            //      no-ops until subsequent casts bring it below, so the
            //      player legitimately holds an oversized hand until
            //      they play enough to trim back to 8.
            //   3. Sigil shake on the triggering sigil in the bar.
            //   4. Pop SFX (reuses the add-consumable "item arrived"
            //      sound).
            //   5. Clear materializingRune after the duration so the
            //      slot falls back to the normal RuneCard render.
            if (pendingMirrorProcs.length > 0) {
                // Stagger procs so a Mimic-doubled Magic Mirror reads as
                // two distinct "pop" beats instead of one chord. The first
                // proc fires synchronously to keep the snappy "duplicate
                // appears on cast-land" feel; subsequent procs (only Mimic
                // copies today) are deferred by `i * stagger` so the SFX
                // and visual entrance space out into a clean pop-pop.
                const MIRROR_PROC_STAGGER_MS = 160;
                const fireMirrorProc = (proc: { duplicate: RuneClientData; sigilId: string; isMimicCopy: boolean }) => {
                    const startTime = performance.now();
                    setMaterializingRune({
                        id: proc.duplicate.id,
                        startTime,
                        duration: DISSOLVE_DURATION_MS,
                    });
                    appendHandRune(proc.duplicate);
                    // `acquiredRunes` is the permanent-across-rounds deck
                    // tracker — the duplicate rejoins the pool on next
                    // round's createPouch. Server does the same push so
                    // sync overwrites with the authoritative list (same
                    // id → no churn).
                    appendAcquiredRune(proc.duplicate);
                    sigilShakeSeq++;
                    activeSigilShake = { sigilId: proc.sigilId, seq: sigilShakeSeq };
                    playAddConsumable();
                    // When this proc is a Mimic copy of the sigil, surface
                    // a "MIMIC!" bubble below the COPIED sigil's slot so
                    // the player can read which proc the Mimic produced.
                    // Anchored to `proc.sigilId` (not "mimic") because the
                    // bubble lives under the sigil being copied, matching
                    // the sigil that just shook.
                    if (proc.isMimicCopy) {
                        arkynStoreInternal.triggerSigilProcBubble(proc.sigilId, 0, "mimic");
                    }
                    setTimeout(() => setMaterializingRune(null), DISSOLVE_DURATION_MS);
                    notify();
                };
                pendingMirrorProcs.forEach((proc, i) => {
                    if (i === 0) {
                        fireMirrorProc(proc);
                    } else {
                        setTimeout(() => fireMirrorProc(proc), i * MIRROR_PROC_STAGGER_MS);
                    }
                });
            }
            notify();
        },
        onRaiseStart: () => {
            raisedSlotIndices = contributingIndices;
            notify();
        },
        onBubblesStart: () => {
            runeDamageBubbles = bubbles;
            procDamageBubbles = procBubblesForCast;
            runeXMultBubbles = xMultBubblesForCast;
            handMultBubbles = handMultBubblesForCast;
            heldXMultBubbles = heldXMultBubblesForCast;
            notify();
        },
        baseMult: resolvedSpell ? (SPELL_TIER_MULT[resolvedSpell.tier] ?? 0) : 0,
        onMultTick: hasAnyMultEvent ? (mult: number) => {
            castMultCounter = mult;
            notify();
        } : undefined,
        onSigilShake: (hasAnyProc || hasAnyMultEvent || hasAnyAccumulatorInc) ? (sigilId: string) => {
            activeSigilShake = { sigilId, seq: ++sigilShakeSeq };
            notify();
        } : undefined,
        onAccumulatorProc: hasAnyAccumulatorInc ? (sigilId: string, delta: number) => {
            arkynStoreInternal.triggerSigilProcBubble(sigilId, delta, "xmult");
            notify();
        } : undefined,
        // Spell-level xMult reveal (Supercell/Eruption/Zephyr). Pops a
        // floating "x{factor}" proc bubble under the triggering sigil at
        // the moment the Mult counter multiplies — filling the pre-existing
        // gap where Supercell's x3 reveal would shake the sigil silently.
        // Per-rune xMult (Big Bang) and accumulator xMult (Executioner)
        // don't route here — see the CastBreakdownEvent flag comments in
        // castBreakdown.ts.
        onXMultReveal: hasAnySpellXMult ? (sigilId: string, factor: number) => {
            arkynStoreInternal.triggerSigilProcBubble(sigilId, factor, "xmult_factor");
            notify();
        } : undefined,
        // Blackjack execute: fire the fullscreen spritesheet + SFX. Only
        // wired when an execute actually rolled this cast so the overlay
        // never mounts gratuitously. The trigger timestamp is captured
        // here so onImpact can defer the floating damage hit + HP drop
        // until after the spritesheet's fade-out completes.
        onExecuteProc: hasAnyExecute ? () => {
            executeTriggerTime = performance.now();
            arkynStoreInternal.triggerBlackjackAnimation();
            // Bell hits first as the "alert" — the player's eye snaps to
            // the spritesheet — then the blackjack stinger lands a beat
            // later as the cinematic plays out. Both fire on the same
            // frame; the audio files themselves carry the temporal offset.
            playBell();
            playBlackjack();
            notify();
        } : undefined,
        // Gold-proc two-phase reveal: show the "+N Gold" overlay over the
        // counter, then (one GOLD_COMMIT_DELAY_S beat later) increment the
        // displayed counter value. Only wired when a gold proc was rolled
        // this cast so there's no overhead when Fortune isn't equipped.
        onGoldProcShow: hasAnyProc ? (amount: number) => {
            arkynStoreInternal.triggerGoldProcBubble(amount);
            notify();
        } : undefined,
        onGoldProcCommit: hasAnyProc ? (amount: number) => {
            arkynStoreInternal.addDisplayedGold(amount);
            notify();
        } : undefined,
        onImpact: () => {
            // Body of the impact: spawn the floating damage bubble, update
            // the round accumulator, release the HP bar lock. Wrapped in a
            // closure so we can either fire it immediately (normal cast)
            // or defer it until after the Blackjack spritesheet finishes
            // (execute case — see the timing branch below).
            const fireImpact = () => {
                // Execute procs (Blackjack) deal damage equal to the
                // enemy's remaining HP — already baked into `totalDamage`
                // up-front via Math.max(totalDamage, enemyHp). No special
                // override needed: the floating bubble shows the same
                // value as the Total chip (no discrepancy) and the run-
                // stats "highest single cast" tracker doesn't get
                // inflated by a flair number. The execution flair lives
                // in the spritesheet + bell stinger SFX instead.
                enemyDamageHit = {
                    amount: totalDamage,
                    spellElement,
                    isCritical: hasCritical,
                    isExecute: hasAnyExecute,
                    seq: ++enemyDamageSeqCounter,
                };
                roundTotalDamage = previousRoundTotal + totalDamage;
                arkynStoreInternal.unlockHpDisplayAndSyncToServer();
                notify();
            };

            // When Blackjack triggered, the spritesheet is still playing
            // (or fading) — wait for it to finish so the kill reveal lands
            // AFTER the cinematic instead of clipping under it. The delay
            // is computed dynamically: spritesheet total minus elapsed time
            // since `onExecuteProc` fired. Clamps to 0 if the spritesheet
            // has already completed by the time the timeline reaches its
            // natural impact moment (rare but possible if many bubble
            // events stretched the timeline past the spritesheet).
            if (hasAnyExecute && executeTriggerTime > 0) {
                const elapsed = performance.now() - executeTriggerTime;
                const remaining = BLACKJACK_ANIMATION_TOTAL_MS - elapsed;
                if (remaining > 0) {
                    setTimeout(fireImpact, remaining);
                    return;
                }
            }
            fireImpact();
        },
        onComplete: () => {
            dissolvingRunes = [];
            dissolveStartTime = 0;
            raisedSlotIndices = [];
            runeDamageBubbles = [];
            procDamageBubbles = [];
            runeXMultBubbles = [];
            handMultBubbles = [];
            heldXMultBubbles = [];
            activeSigilShake = null;
            isCastAnimating = false;
            // Release the gold-counter lock and snap the displayed value
            // to the server's authoritative total. Also clear the proc
            // overlay so the next cast mounts a fresh bubble state.
            arkynStoreInternal.unlockGoldDisplayAndSyncToServer();
            arkynStoreInternal.clearGoldProcBubble();
            // NOTE: `castingRuneIds` is intentionally NOT cleared here. The
            // sync system clears it atomically with `setHand` so the
            // remaining hand cards (which slid left to fill the cast gap)
            // stay pinned in their slid positions until the new hand layout
            // commits — at which point HandDisplay's useGSAP snaps the
            // persisted slot transforms to x=0 (FLIP-style) without flicker.
            notify();
        },
    });
}

/**
 * Run the owned discard-hook sigils through `SIGIL_DISCARD_HOOKS` with the
 * same inputs the server will see, and flatten the resulting effects. The
 * client uses this to pick the right animation path (dissolve vs slide-down)
 * BEFORE sending `ARKYN_DISCARD`, so the visual fires in lockstep with the
 * server's authoritative resolution instead of waiting on an echo.
 *
 * Works because the current discard-hook sigils (Banish) are pure
 * predicates over `discardNumber` / `runeCount` / `runes` — no server-side
 * RNG, no hidden state. If a future discard sigil needs server-only
 * information (e.g. a deterministic roll), its hook must return an
 * EMPTY effect list here and signal via schema instead.
 */
function previewDiscardEffects(
    sigils: readonly string[],
    discardNumber: number,
    runes: readonly { id: string; element: string; rarity: string; level: number }[],
    ahoyElement: string,
): { banishIndex: number; grantedGold: number; sigilId: string } | null {
    // Mirrors the server's handleDiscard dispatcher — Mimic copies expand
    // to whichever Mimic-compatible hook sits to the right (e.g. Ahoy),
    // so a Mimic+Ahoy pair fires the hook twice and doubles the gold.
    // Walk every expanded entry and sum gold across all of them so the
    // preview matches the server's authoritative credit. `sigilId` keeps
    // the FIRST firing sigil's id for UX anchoring (shake + bubble land
    // on whichever sigil triggered the proc flow).
    let banishIndex = -1;
    let grantedGold = 0;
    let firstSigilId = "";
    for (const sigilId of expandMimicSigilsDetailed(sigils).map(e => e.sigilId)) {
        const hook = SIGIL_DISCARD_HOOKS[sigilId];
        if (!hook?.onDiscard) continue;
        const effects = hook.onDiscard({
            discardNumber,
            runeCount: runes.length,
            runes,
            ahoyElement,
        });
        if (!effects || effects.length === 0) continue;
        for (const e of effects) {
            if (e.type === "banishRune" && banishIndex < 0) banishIndex = e.runeIndex;
            else if (e.type === "grantGold") grantedGold += e.amount;
        }
        if (!firstSigilId) firstSigilId = sigilId;
    }
    if (banishIndex >= 0 || grantedGold > 0) {
        return { banishIndex, grantedGold, sigilId: firstSigilId };
    }
    return null;
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

    // Check whether a discard-hook sigil (Banish) would proc on this
    // discard. Mirrors the server: `discardNumber` is 1-indexed, and the
    // client reads `discardsUsedThisRound` (the count BEFORE this discard)
    // from the store, so `+1` gives the correct number for the hook.
    const sigils = arkynStoreInternal.getSigils();
    const priorDiscards = arkynStoreInternal.getDiscardsUsedThisRound();
    const discardedRuneData = discs.map(d => ({
        id: d.rune.id,
        element: d.rune.element,
        rarity: d.rune.rarity,
        level: d.rune.level,
    }));
    const ahoyElement = arkynStoreInternal.getAhoyDiscardElement();
    const discardPreview = previewDiscardEffects(
        sigils,
        priorDiscards + 1,
        discardedRuneData,
        ahoyElement,
    );

    if (discardPreview && discardPreview.banishIndex >= 0) {
        // Sigil hook is firing — route to the banish orchestrator which
        // plays a dissolve (not a slide-down) and pops the reward UX.
        runBanishFlow(discs, serverIndices, discardPreview);
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
        // Gold-only discard proc (Ahoy) — freeze the displayed gold so the
        // bubble + sigil reaction pop on the pre-proc value before the
        // commit tick unlocks it in sync with the SFX.
        if (discardPreview && discardPreview.grantedGold > 0) {
            arkynStoreInternal.lockGoldDisplay();
        }
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

    // Gold-only proc (Ahoy): shake the triggering sigil, pop the
    // "+N Gold" bubble over its slot + over the gold counter, and tick
    // the counter in sync with the SFX. Same cadence as the Banish flow's
    // reward beats so the two proc UXes read as siblings.
    if (discardPreview && discardPreview.grantedGold > 0) {
        setTimeout(() => {
            sigilShakeSeq++;
            activeSigilShake = { sigilId: discardPreview.sigilId, seq: sigilShakeSeq };
            arkynStoreInternal.triggerSigilProcBubble(discardPreview.sigilId, discardPreview.grantedGold);
            arkynStoreInternal.triggerGoldProcBubble(discardPreview.grantedGold);
            notify();
        }, BANISH_SIGIL_REACT_DELAY_MS);

        setTimeout(() => {
            playGold();
            arkynStoreInternal.addDisplayedGold(discardPreview.grantedGold);
            arkynStoreInternal.unlockGoldDisplayAndSyncToServer();
            notify();
        }, BANISH_GOLD_COMMIT_DELAY_MS);

        setTimeout(() => {
            arkynStoreInternal.clearSigilProcBubble();
            arkynStoreInternal.clearGoldProcBubble();
            notify();
        }, BANISH_GOLD_COMMIT_DELAY_MS + BANISH_CLEANUP_EXTRA_MS);
    }
}

/**
 * Alternate discard path taken when a SIGIL_DISCARD_HOOKS sigil (Banish)
 * fires on this discard. Instead of the standard slide-down-and-fade
 * discard flyer, the rune plays the same dissolve shader casts use —
 * making the "permanent destruction" read as a decisive event rather than
 * a routine toss. While the dissolve plays:
 *  - the Banish sigil shakes (via activeSigilShake)
 *  - a "+N Gold" proc bubble pops over the Banish slot in the SigilBar
 *  - the gold counter ticks up and the gold SFX plays
 * The `ARKYN_DISCARD` message is sent at t=0 so the server's schema patch
 * (pouch rebuild + banishedRunes update) lands while the visual plays out.
 */
function runBanishFlow(
    discs: DiscardingRune[],
    serverIndices: number[],
    preview: { banishIndex: number; grantedGold: number; sigilId: string },
) {
    flushSync(() => {
        banishingRunes = discs;
        banishingRuneIds = discs.map(d => d.rune.id);
        banishStartTime = performance.now();
        isBanishAnimating = true;
        // Freeze the gold display so the "+N" bubble pops over the
        // counter's pre-proc value; the commit tick below unlocks it in
        // sync with the SFX.
        arkynStoreInternal.lockGoldDisplay();
        arkynStoreInternal.clearSelection();
        notify();
    });

    // Send the server message now — the server will process the discard,
    // add the rune to banishedRunes, and credit gold. Client schema sync
    // will arrive mid-dissolve; `lockGoldDisplay` holds the counter at its
    // pre-proc value until we commit it alongside the SFX below.
    sendArkynMessage(ARKYN_DISCARD, { selectedIndices: serverIndices });

    // Trigger the SigilBar sigil shake + the "+N Gold" proc bubble.
    // Delayed a hair so the dissolve starts first and the UX reads as
    // "rune tears apart → sigil reacts → gold awarded" rather than all
    // three firing on the same frame.
    setTimeout(() => {
        // Sigil shake — same channel Voltage/Fortune use during casts.
        sigilShakeSeq++;
        activeSigilShake = { sigilId: preview.sigilId, seq: sigilShakeSeq };
        // Gold proc bubble over the SigilBar slot.
        arkynStoreInternal.triggerSigilProcBubble(preview.sigilId, preview.grantedGold);
        // Also fire the GoldCounter's own "+N" overlay — matches Fortune's
        // mid-cast proc UX and gives the player a second read of the reward.
        arkynStoreInternal.triggerGoldProcBubble(preview.grantedGold);
        notify();
    }, BANISH_SIGIL_REACT_DELAY_MS);

    setTimeout(() => {
        // Commit the gold: tick the displayed counter + play the gold SFX.
        playGold();
        arkynStoreInternal.addDisplayedGold(preview.grantedGold);
        arkynStoreInternal.unlockGoldDisplayAndSyncToServer();
        notify();
    }, BANISH_GOLD_COMMIT_DELAY_MS);

    // Clean up after the dissolve completes. DISSOLVE_DURATION_MS comes
    // from the shared timing constants so any future tuning of the dissolve
    // visual automatically carries to the banish cleanup.
    const cleanupDelayMs = DISSOLVE_DURATION_MS + BANISH_CLEANUP_EXTRA_MS;
    setTimeout(() => {
        banishingRunes = [];
        banishingRuneIds = [];
        banishStartTime = 0;
        isBanishAnimating = false;
        arkynStoreInternal.clearSigilProcBubble();
        arkynStoreInternal.clearGoldProcBubble();
        notify();
    }, cleanupDelayMs);
}
