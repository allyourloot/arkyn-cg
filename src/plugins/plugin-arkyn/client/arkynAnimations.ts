import { useSyncExternalStore } from "react";
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
import { playPlaceRune, playCount, playDamage, playCast } from "./sfx";

// ----- Animation timing constants -----
export const DISSOLVE_DURATION_MS = 550;
export const DISSOLVE_STAGGER_MS = 150;
// Beat between the runes landing in the play area and the "valid" runes
// lifting up. Long enough for the player to register every played rune
// sitting in its slot before the spell-resolution choreography starts.
export const SETTLE_DELAY_MS = 1000;
// Duration of the slot raise transition. MUST match the .slot transition
// duration in PlayArea.module.css. We delay the damage bubbles by this
// amount so the runes finish lifting BEFORE their numbers start popping.
export const RAISE_DURATION_MS = 220;
// Duration of a single floating damage bubble's full animation (appear +
// drift + fade). MUST match the keyframe duration in RuneDamageBubble.module.css.
export const BUBBLE_DURATION_MS = 600;
// Stagger between consecutive damage bubbles in a multi-rune cast. Each
// successive contributing rune's bubble appears this many ms after the
// previous one so the "count" reads sequentially.
export const BUBBLE_STAGGER_MS = 180;
// Quiet beat after the LAST bubble finishes before the dissolve begins —
// gives the final number a moment to land before the runes tear apart.
export const BUBBLE_TAIL_BUFFER_MS = 150;
// Duration of the enemy health-bar floating damage / shake animation.
export const ENEMY_DAMAGE_HIT_MS = 900;

const FLY_DURATION_MS = 300;
const PLACE_SFX_STAGGER_MS = 100;
const DISCARD_FLY_DURATION_MS = 400;
const DRAW_FLY_DURATION_MS = 450;

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

        drawingRunes = draws;
        notify();

        // After animation completes, show the real runes
        setTimeout(() => {
            drawingRunes = [];
            drawingRuneIds = [];
            notify();
        }, DRAW_FLY_DURATION_MS);
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

    flyingRunes = flying;
    isCastAnimating = true;
    // Cast SFX fires the moment the runes start flying toward the play
    // area — sound and visual launch together.
    playCast();
    // Freeze the HP bar at its pre-cast value. The server will apply the
    // real HP drop as soon as it receives the cast, but we don't want the
    // bar to lurch until the visual impact moment at the end of the
    // dissolve. The cleanup step unlocks and catches the bar up.
    arkynStoreInternal.lockHpDisplay();
    arkynStoreInternal.clearSelection();
    // Remember the cast runes for the SpellPreview "Last Cast" view.
    arkynStoreInternal.setLastCastRunes(castRunes);
    notify();

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

    // Phase 1: fly to the play area.
    setTimeout(() => {
        sendArkynMessage(ARKYN_CAST, { selectedIndices: serverIndices });
        flyingRunes = [];

        // Pre-compute the contributing-rune info now so the deferred raise
        // step doesn't need to re-derive it later.
        const contributingIndices = getContributingRuneIndices(castRunes);
        const contributing = contributingIndices.length;
        // Per-rune damage = total / contributing, distributed evenly with
        // any remainder spread across the first few runes so the displayed
        // numbers always sum to exactly `totalDamage`.
        const perRuneBase = contributing > 0 ? Math.floor(totalDamage / contributing) : 0;
        const perRuneRemainder = contributing > 0 ? totalDamage - perRuneBase * contributing : 0;

        // The spell's primary element drives the outline color of every
        // bubble in this cast — and the matching enemy floating damage —
        // so the colorway reads as one cohesive spell impact.
        const spellElement = resolvedSpell?.element ?? "";
        const bubbles: (RuneDamageBubble | null)[] = new Array(MAX_PLAY).fill(null);
        for (let i = 0; i < contributingIndices.length; i++) {
            const slotIdx = contributingIndices[i];
            const rune = castRunes[slotIdx];
            if (!rune) continue;
            bubbles[slotIdx] = {
                amount: perRuneBase + (i < perRuneRemainder ? 1 : 0),
                spellElement,
                seq: ++bubbleSeqCounter,
                // Each successive contributing rune's bubble waits its
                // turn so the damage reads like a counter ticking up.
                delayMs: i * BUBBLE_STAGGER_MS,
            };
        }

        // Dynamic raise hold: long enough for the slot raise transition
        // to FIRST finish, then for the LAST staggered bubble to fully
        // play out (plus a small tail beat) before the dissolve tears
        // the runes apart. The bubbles wait for the raise to complete so
        // the "lift then count" choreography reads in two beats instead
        // of all happening on the same frame.
        const lastBubbleDelayMs = Math.max(0, contributing - 1) * BUBBLE_STAGGER_MS;
        const raiseHoldMs =
            RAISE_DURATION_MS + (
                contributing > 0
                    ? lastBubbleDelayMs + BUBBLE_DURATION_MS + BUBBLE_TAIL_BUFFER_MS
                    : BUBBLE_DURATION_MS + BUBBLE_TAIL_BUFFER_MS
            );

        // Phase 2a: cards land in the play area as static runes. We mount
        // them in DissolveShader immediately but push the dissolve start
        // time into the future by SETTLE_DELAY_MS + raiseHoldMs so they
        // read as fully intact runes through the settle beat AND the
        // subsequent raise hold. The raise + damage bubbles wait for the
        // settle delay so the player has a moment to register every
        // played rune sitting in its slot before the spell resolution
        // choreography starts.
        dissolvingRunes = castRunes;
        dissolveStartTime = performance.now() + SETTLE_DELAY_MS + raiseHoldMs;
        notify();

        // Play the "place rune" SFX once for each rune that actually
        // contributes to the resolved spell. Non-matching runes still fly
        // and dissolve visually but stay silent. Stagger so the sounds
        // layer instead of stacking into one thud.
        for (let i = 0; i < contributing; i++) {
            if (i === 0) playPlaceRune();
            else setTimeout(playPlaceRune, i * PLACE_SFX_STAGGER_MS);
        }

        // Phase 2b: settle delay over — raise the valid runes. This is its
        // own beat now: the slots lift up and HOLD before any numbers pop.
        setTimeout(() => {
            raisedSlotIndices = contributingIndices;
            notify();
        }, SETTLE_DELAY_MS);

        // Phase 2c: raise transition complete — mount the per-rune damage
        // bubbles. They stagger themselves via their own CSS animation-
        // delay (delayMs field), so they appear one at a time and the
        // runes shake in sync with each bubble.
        const bubblesStartMs = SETTLE_DELAY_MS + RAISE_DURATION_MS;
        setTimeout(() => {
            runeDamageBubbles = bubbles;
            notify();
        }, bubblesStartMs);

        // Schedule one "count" SFX per contributing rune, in lockstep with
        // its bubble. Each bubble appears at bubblesStartMs + delayMs, so
        // we fire its sound at the same offset.
        for (let i = 0; i < contributingIndices.length; i++) {
            const countDelay = bubblesStartMs + i * BUBBLE_STAGGER_MS;
            setTimeout(playCount, countDelay);
        }

        // Phase 3: wait for the settle delay + raise hold + LAST staggered
        // dissolve to finish. At that moment — with the per-rune bubbles
        // done and all runes fully torn apart — we fire the enemy damage
        // hit (floating total + shake), unlock the HP bar so it catches
        // up to the server value, and clear the dissolve state. All three
        // things land on the same frame so the visual impact reads as one
        // cohesive spell hit instead of the bar lurching early.
        const totalDissolveMs =
            SETTLE_DELAY_MS +
            raiseHoldMs +
            (castRunes.length - 1) * DISSOLVE_STAGGER_MS +
            DISSOLVE_DURATION_MS;
        setTimeout(() => {
            enemyDamageHit = {
                amount: totalDamage,
                spellElement,
                seq: ++enemyDamageSeqCounter,
            };
            // The enemy floating damage + bar shake fires on this frame —
            // play the impact SFX in lockstep so the sound lands with the hit.
            playDamage();
            // Release the HP bar lock and snap the displayed value to
            // whatever the server currently says. Because the cast was
            // sent immediately at fly-complete, the server's HP is
            // already post-damage — the bar will animate from its frozen
            // pre-cast value down to the new target via its CSS
            // width/color transitions.
            arkynStoreInternal.unlockHpDisplayAndSyncToServer();

            dissolvingRunes = [];
            dissolveStartTime = 0;
            raisedSlotIndices = [];
            runeDamageBubbles = [];
            isCastAnimating = false;
            notify();
        }, totalDissolveMs);
    }, FLY_DURATION_MS);
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

    discardingRunes = discs;
    isDiscardAnimating = true;
    arkynStoreInternal.clearSelection();
    notify();

    setTimeout(() => {
        sendArkynMessage(ARKYN_DISCARD, { selectedIndices: serverIndices });
        discardingRunes = [];
        isDiscardAnimating = false;
        notify();
    }, DISCARD_FLY_DURATION_MS);
}
