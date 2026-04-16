import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import {
    MAX_PLAY,
    ARKYN_CAST,
    ARKYN_DISCARD,
    CASTS_PER_ROUND,
    SPELL_TIER_MULT,
    getHandMultBonus,
    getIgnoredResistanceElements,
    getSpellXMult,
    iterateProcs,
    resolveSpell,
    calculateSpellDamage,
    getContributingRuneIndices,
    type ProcEffect,
} from "../shared";
import type { RarityType } from "../shared/arkynConstants";
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
    RAISE_LIFT_PX,
    SLOT_RAISE_S,
    SLOT_LOWER_S,
    BAR_SHAKE_FRAME_S,
    RUNE_SHAKE_FRAME_S,
} from "./animations/timingConstants";
import {
    BUBBLE_STAGGER_MS,
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
let enemyDamageHit: EnemyDamageHit = { amount: 0, spellElement: "", isCritical: false, seq: 0 };
let enemyDamageSeqCounter = 0;

let flyingRunes: FlyingRune[] = [];
let isCastAnimating = false;
// IDs of the runes currently being cast — used by HandDisplay to keep their
// hand slots hidden for the entire cast sequence (fly → dissolve → impact),
// since the server's hand update is now deferred until the cast finishes.
let castingRuneIds: string[] = [];
let discardingRunes: DiscardingRune[] = [];
let isDiscardAnimating = false;
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
// Proc damage bubbles — same structure as runeDamageBubbles, indexed by slot.
// Non-proc slots are null. Populated when a sigil (e.g. Voltage) procs
// during a cast, then rendered alongside the normal bubbles in PlayArea.
let procDamageBubbles: (RuneDamageBubble | null)[] = [];
// Monotonic seq for sigil shake events — forces remount on every proc.
let sigilShakeSeq = 0;
// Active sigil shake event — SigilBar reads this to animate the matching icon.
let activeSigilShake: { sigilId: string; seq: number } | null = null;

// Synapse sigil — mult bubbles shown on held Psy runes in the hand during cast.
// Indexed by HAND INDEX (not slot). Non-Psy or played runes are null.
export interface HandMultBubble {
    amount: number;     // e.g. 2 for "+2 Mult"
    seq: number;
    delayMs: number;
}
let handMultBubbles: (HandMultBubble | null)[] = [];

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

// ----- Helpers -----

function isAnimating(): boolean {
    return isCastAnimating || isDiscardAnimating;
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

    // Resolve the spell on the client so we can compute the same Base + Mult
    // breakdown the server uses. Each contributing rune is evaluated against
    // the enemy's resistances/weaknesses individually, so the per-rune
    // bubbles, the Spell Preview Base counter, and the floating enemy
    // damage number all read identical numbers from this single breakdown.
    const ownedSigils = arkynStoreInternal.getSigils();
    const resolvedSpell = resolveSpell(castRunes.map(r => ({ element: r.element })), ownedSigils);
    const contributingIndices = getContributingRuneIndices(castRunes, ownedSigils);
    const contributing = contributingIndices.length;
    const contributingRuneData = contributingIndices.map(i => ({ element: castRunes[i].element }));
    // Parallel rarity array — runs alongside contributingRuneData so
    // calculateSpellDamage can look up each rune's RUNE_BASE_DAMAGE.
    const contributingRuneRarities: RarityType[] = contributingIndices.map(
        i => castRunes[i].rarity as RarityType,
    );

    // Hand-based mult bonus from all owned hand-mult sigils (Synapse,
    // future equivalents). `perSigil` carries per-rune entries with the
    // triggering sigilId — used below to build bubbles + tick the mult
    // counter generically (no "synapse" strings in the timeline).
    const handMultResult = getHandMultBonus(ownedSigils, hand, sortedSelected);
    const handMultBonus = handMultResult.total;

    // Spell-element xMult from Supercell-style sigils. Multiplicative —
    // applied after all additive bonuses so the animation can reveal the
    // multiplier as a dramatic final mult event.
    const spellElements = resolvedSpell
        ? (resolvedSpell.comboElements ? [...resolvedSpell.comboElements] : [resolvedSpell.element])
        : [];
    const xMultResult = getSpellXMult(ownedSigils, spellElements);
    const xMultTotal = xMultResult.total;

    // Strip resistances nullified by owned resist-ignore sigils (Impale-style)
    // so the per-rune mod becomes neutral (×1.0) instead of resisted (×0.5).
    // The UI still reads the raw enemy state and overlays a red X on the
    // ignored chips — this filter is damage-only.
    const rawResistances = arkynStoreInternal.getEnemyResistances();
    const ignoredResistances = getIgnoredResistanceElements(ownedSigils);
    const effectiveResistances = ignoredResistances.size > 0
        ? rawResistances.filter(e => !ignoredResistances.has(e))
        : rawResistances;

    const breakdown = resolvedSpell
        ? calculateSpellDamage(
            resolvedSpell,
            contributingRuneData,
            contributingRuneRarities,
            effectiveResistances,
            arkynStoreInternal.getEnemyWeaknesses(),
            arkynStoreInternal.getScrollLevels(),
            handMultBonus,
            xMultTotal,
        )
        : null;
    // Final post-mult damage applied to the enemy on the impact frame.
    // Falls back to 0 if the spell didn't resolve (defensive — castSpell
    // bails on selectedRuneIds.length === 0 above, so this only matters
    // if a future hand passes the gate without resolving).
    let totalDamage = breakdown?.finalDamage ?? 0;
    const spellBaseDamage = breakdown?.spellBase ?? 0;
    let baseTotal = breakdown?.baseTotal ?? 0;
    const hasCritical = breakdown?.isCritical.some(Boolean) ?? false;

    // The spell's primary element drives the outline color of every bubble
    // in this cast — and the matching enemy floating damage — so the
    // colorway reads as one cohesive spell impact.
    const spellElement = resolvedSpell?.element ?? "";
    const bubbles: (RuneDamageBubble | null)[] = new Array(MAX_PLAY).fill(null);
    const procBubblesForCast: (RuneDamageBubble | null)[] = new Array(MAX_PLAY).fill(null);

    // ----- Sigil procs -----
    // Generic proc loop mirrors server's iterateProcs exactly. Each proc
    // event carries the sigilId + effect so the timeline can dispatch
    // shakes generically and branch on effect type (damage vs gold). RNG
    // is deterministic — server and client roll identical sequences.
    // procsPerRune[i] = { sigilId, effect } | null for the i-th contributing rune.
    const procsPerRune: ({ sigilId: string; effect: ProcEffect } | null)[] = new Array(contributingIndices.length).fill(null);
    let procDamageTotal = 0;
    if (breakdown && ownedSigils.length > 0) {
        const castNumber = CASTS_PER_ROUND - arkynStoreInternal.getCastsRemaining();
        const runSeed = arkynStoreInternal.getRunSeed();
        const round = arkynStoreInternal.getCurrentRound();
        const contributingElements = contributingIndices.map(idx => castRunes[idx]?.element ?? "");
        for (const proc of iterateProcs(
            ownedSigils,
            contributingElements,
            runSeed,
            round,
            castNumber,
            breakdown.isCritical,
        )) {
            procsPerRune[proc.runeIdx] = { sigilId: proc.sigilId, effect: proc.effect };
            if (proc.effect.type === "double_damage") {
                procDamageTotal += breakdown.runeBaseContributions[proc.runeIdx] * breakdown.mult;
            }
            // grant_gold: no damage contribution — handled below when
            // building the proc bubble (kind: "gold").
        }
    }
    const hasAnyProc = procsPerRune.some(p => p !== null);
    totalDamage += procDamageTotal;
    // Adjust baseTotal to include proc contributions (for lastCastBaseDamage).
    // Only damage-type procs contribute to Base — gold procs are pure economy.
    if (breakdown && hasAnyProc) {
        for (let i = 0; i < procsPerRune.length; i++) {
            const p = procsPerRune[i];
            if (p && p.effect.type === "double_damage") {
                baseTotal += breakdown.runeBaseContributions[i];
            }
        }
    }

    // ----- Build bubble arrays and extended runeBreakdown -----
    // The extended breakdown interleaves proc entries after their parent rune
    // so the timeline staggers them naturally. Each event in the array gets
    // one BUBBLE_STAGGER_MS slot. `isGold` distinguishes Fortune-style
    // grant_gold procs from damage procs so the timeline skips the Base
    // counter tick for them (gold isn't damage).
    const runeBreakdown: { base: number; final: number; isResisted: boolean; isCritical: boolean; isProc: boolean; isSynapse?: boolean; isGold?: boolean; isXMult?: boolean; goldDelta?: number; multDelta?: number; xMultFactor?: number; sigilId?: string }[] = [];
    let eventIdx = 0;
    if (breakdown) {
        for (let i = 0; i < contributingIndices.length; i++) {
            const slotIdx = contributingIndices[i];
            const rune = castRunes[slotIdx];
            if (!rune) continue;
            const isCritical = breakdown.isCritical[i];
            const isResisted = breakdown.isResisted[i];
            const postModifier = breakdown.runeBaseContributions[i];
            const initialDisplay = postModifier;
            bubbles[slotIdx] = {
                amount: postModifier,
                baseAmount: initialDisplay,
                spellElement,
                isCritical,
                isResisted,
                seq: ++bubbleSeqCounter,
                delayMs: eventIdx * BUBBLE_STAGGER_MS,
            };
            runeBreakdown.push({
                base: initialDisplay,
                final: postModifier,
                isResisted,
                isCritical,
                isProc: false,
            });
            eventIdx++;

            // Interleave proc bubble right after the parent rune. Damage
            // procs (Voltage) show the rune's base contribution again;
            // gold procs (Fortune) show the flat gold amount with the
            // "gold" bubble variant and contribute nothing to damage.
            const proc = procsPerRune[i];
            if (proc) {
                const isGoldProc = proc.effect.type === "grant_gold";
                const bubbleAmount = isGoldProc
                    ? proc.effect.amount
                    : postModifier;
                procBubblesForCast[slotIdx] = {
                    amount: bubbleAmount,
                    baseAmount: bubbleAmount,
                    spellElement,
                    isCritical: false,
                    isResisted: false,
                    seq: ++bubbleSeqCounter,
                    delayMs: eventIdx * BUBBLE_STAGGER_MS,
                    kind: isGoldProc ? "gold" : "damage",
                };
                runeBreakdown.push({
                    base: isGoldProc ? 0 : postModifier,
                    final: isGoldProc ? 0 : postModifier,
                    isResisted: false,
                    isCritical: false,
                    isProc: true,
                    isGold: isGoldProc,
                    goldDelta: isGoldProc ? proc.effect.amount : undefined,
                    sigilId: proc.sigilId,
                });
                eventIdx++;
            }
        }
    }

    // ----- Hand-mult bubbles (Synapse-style sigils) -----
    // Build mult bubbles for each held rune that matches a hand-mult sigil's
    // element. These appear on hand rune cards during the bubble phase,
    // staggered after all play-area bubbles finish. Each entry carries its
    // triggering sigilId so the timeline dispatches shakes generically.
    const handMultBubblesForCast: (HandMultBubble | null)[] = new Array(hand.length).fill(null);
    for (const entry of handMultResult.perSigil) {
        handMultBubblesForCast[entry.handIndex] = {
            amount: entry.multDelta,
            seq: ++bubbleSeqCounter,
            delayMs: eventIdx * BUBBLE_STAGGER_MS,
        };
        runeBreakdown.push({
            base: 0,
            final: 0,
            isResisted: false,
            isCritical: false,
            isProc: false,
            isSynapse: true,
            multDelta: entry.multDelta,
            sigilId: entry.sigilId,
        });
        eventIdx++;
    }
    const hasAnyHandMultProc = handMultResult.perSigil.length > 0;

    // ----- Spell-element xMult entries (Supercell-style sigils) -----
    // Appended AFTER synapse entries so the animation reveals the
    // multiplicative factor as the final dramatic mult event before the
    // total reveal tween. Each xMult entry multiplies runningMult in the
    // timeline (unlike synapse which adds).
    for (const entry of xMultResult.entries) {
        runeBreakdown.push({
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
    const hasAnyXMult = xMultResult.entries.length > 0;
    const hasAnyMultEvent = hasAnyHandMultProc || hasAnyXMult;

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
            notify();
        },
        onRaiseStart: () => {
            raisedSlotIndices = contributingIndices;
            notify();
        },
        onBubblesStart: () => {
            runeDamageBubbles = bubbles;
            procDamageBubbles = procBubblesForCast;
            handMultBubbles = handMultBubblesForCast;
            notify();
        },
        baseMult: resolvedSpell ? (SPELL_TIER_MULT[resolvedSpell.tier] ?? 0) : 0,
        onMultTick: hasAnyMultEvent ? (mult: number) => {
            castMultCounter = mult;
            notify();
        } : undefined,
        onSigilShake: (hasAnyProc || hasAnyMultEvent) ? (sigilId: string) => {
            activeSigilShake = { sigilId, seq: ++sigilShakeSeq };
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
            enemyDamageHit = {
                amount: totalDamage,
                spellElement,
                isCritical: hasCritical,
                seq: ++enemyDamageSeqCounter,
            };
            // Set the round accumulator to the final cumulative value.
            // Uses the snapshot + this cast's damage (same value the tween
            // landed on) so there's no double-counting window.
            roundTotalDamage = previousRoundTotal + totalDamage;
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
            procDamageBubbles = [];
            handMultBubbles = [];
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
