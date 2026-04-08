import { useSyncExternalStore } from "react";
import {
    MAX_PLAY,
    ARKYN_CAST,
    ARKYN_DISCARD,
    ARKYN_READY,
    ARKYN_JOIN,
    resolveSpell,
    calculateDamage,
} from "../shared";
import { playSelectRune, playPlaceRune } from "./sfx";

type Listener = () => void;

const listeners = new Set<Listener>();

// ----- Store state -----
export interface RuneClientData {
    id: string;
    element: string;
    rarity: string;
    level: number;
}

// `hand` is the display order (locally reorderable). `serverHand` mirrors the
// raw server order so cast/discard can translate selection to server indices.
let hand: RuneClientData[] = [];
let serverHand: RuneClientData[] = [];
// Selection is tracked by rune id so it follows runes through reorders;
// `selectedIndices` is a derived view in display order, kept for the existing API.
let selectedRuneIds: string[] = [];
let selectedIndices: number[] = [];
let playedRunes: RuneClientData[] = [];
let enemyName = "";
let enemyHp = 0;
let enemyMaxHp = 0;
let enemyElement = "";
let enemyResistances: string[] = [];
let enemyWeaknesses: string[] = [];
let gamePhase = "waiting";
let lastSpellName = "";
let lastSpellTier = 0;
let lastDamage = 0;
let currentRound = 0;
let pouchSize = 0;
let castsRemaining = 3;
let discardsRemaining = 3;

let sendFn: ((type: string, data: unknown) => void) | null = null;

// ----- Internal -----
function notify() {
    for (const l of listeners) l();
}

export function subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
}

// ----- Setters (called by sync system) -----
export function setConnection(send: (type: string, data: unknown) => void) {
    sendFn = send;
}

export function setHand(h: RuneClientData[]) {
    serverHand = h;

    // Preserve current display order for runes that are still present;
    // append any new runes (in their server order) to the end.
    const newIds = new Set(h.map(r => r.id));
    const kept = hand.filter(r => newIds.has(r.id));
    const keptIds = new Set(kept.map(r => r.id));
    const fresh = h.filter(r => !keptIds.has(r.id));
    hand = [...kept, ...fresh];

    // Drop selection entries whose runes no longer exist.
    selectedRuneIds = selectedRuneIds.filter(id => newIds.has(id));
    recomputeSelectedIndices();

    notify();
}

function recomputeSelectedIndices() {
    const next: number[] = [];
    for (const id of selectedRuneIds) {
        const idx = hand.findIndex(r => r.id === id);
        if (idx >= 0) next.push(idx);
    }
    selectedIndices = next;
}

export function reorderHand(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= hand.length) return;
    if (toIndex < 0 || toIndex >= hand.length) return;

    const next = [...hand];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    hand = next;
    recomputeSelectedIndices();
    notify();
}

export function getHandIndex(runeId: string): number {
    return hand.findIndex(r => r.id === runeId);
}
export function setPlayedRunes(r: RuneClientData[]) { playedRunes = r; notify(); }
export function setEnemyName(n: string) { enemyName = n; notify(); }
export function setEnemyHp(hp: number) { enemyHp = hp; notify(); }
export function setEnemyMaxHp(hp: number) { enemyMaxHp = hp; notify(); }
export function setEnemyElement(e: string) { enemyElement = e; notify(); }
export function setEnemyResistances(r: string[]) { enemyResistances = r; notify(); }
export function setEnemyWeaknesses(w: string[]) { enemyWeaknesses = w; notify(); }
export function setGamePhase(p: string) { gamePhase = p; notify(); }
export function setLastSpellName(n: string) { lastSpellName = n; notify(); }
export function setLastSpellTier(t: number) { lastSpellTier = t; notify(); }
export function setLastDamage(d: number) { lastDamage = d; notify(); }
export function setCurrentRound(r: number) { currentRound = r; notify(); }
export function setPouchSize(s: number) { pouchSize = s; notify(); }
export function setCastsRemaining(c: number) { castsRemaining = c; notify(); }
export function setDiscardsRemaining(d: number) { discardsRemaining = d; notify(); }

export function clearSelectedIndices() {
    selectedRuneIds = [];
    selectedIndices = [];
    notify();
}

// ----- Actions (client-only selection + server messages) -----
export function toggleRuneSelection(index: number) {
    const rune = hand[index];
    if (!rune) return;

    let didChange = false;
    if (selectedRuneIds.includes(rune.id)) {
        selectedRuneIds = selectedRuneIds.filter(id => id !== rune.id);
        didChange = true;
    } else if (selectedRuneIds.length < MAX_PLAY) {
        selectedRuneIds = [...selectedRuneIds, rune.id];
        didChange = true;
    }
    if (didChange) playSelectRune();
    recomputeSelectedIndices();
    notify();
}

// ----- Play-area dissolve effect -----

// Runes currently dissolving in the play area. Driven entirely by the client
// cast flow — server's playedRunes is no longer rendered.
let dissolvingRunes: RuneClientData[] = [];
let dissolveStartTime = 0;
// Slot indices (0-based, in display order) of the runes that actually
// contribute to the resolved spell. PlayArea lifts these slots so the player
// can see which of their played runes were "valid" for the cast before the
// dissolve animation tears them apart.
let raisedSlotIndices: number[] = [];
// Per-slot floating damage numbers shown above raised runes during the cast
// hold. The spell element drives the stroke color so every bubble in a cast
// shares the same outline tint. Indexed BY SLOT INDEX so a non-contributing
// slot is `null`.
export interface RuneDamageBubble {
    amount: number;
    spellElement: string;
    /** Monotonically increasing — used as a React key so re-casts re-trigger CSS animation. */
    seq: number;
}
let runeDamageBubbles: (RuneDamageBubble | null)[] = [];
let bubbleSeqCounter = 0;

// One-shot floating damage hit on the enemy health bar. `seq` increments on
// every cast so the EnemyHealthBar effect re-fires even when the same damage
// number is dealt twice in a row. `spellElement` drives the floating
// number's stroke color to match the cast that produced it.
export interface EnemyDamageHit {
    amount: number;
    spellElement: string;
    seq: number;
}
let enemyDamageHit: EnemyDamageHit = { amount: 0, spellElement: "", seq: 0 };
let enemyDamageSeqCounter = 0;

// The exact runes from the most recent cast. Persists between casts so the
// SpellPreview panel can re-resolve them and display the last cast result
// (element / description / combo info that the server doesn't sync).
let lastCastRunes: RuneClientData[] = [];

export function useLastCastRunes() {
    return useSyncExternalStore(subscribe, () => lastCastRunes);
}

export const DISSOLVE_DURATION_MS = 550;
export const DISSOLVE_STAGGER_MS = 150;
// How long the "valid" runes stay raised in the play area after landing,
// before the dissolve actually begins. Tuned long enough that the player
// can read every per-rune floating damage number above the raised runes
// before the dissolve tears them apart.
export const RAISE_HOLD_MS = 1100;
// Duration of the floating per-rune damage bubble's float-up + fade
// animation, kept in sync with the matching CSS keyframes so the bubble
// finishes just before the dissolve begins.
export const RUNE_DAMAGE_BUBBLE_MS = 1000;
// Duration of the enemy health-bar floating damage / shake animation.
export const ENEMY_DAMAGE_HIT_MS = 900;

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

// ----- Animation state -----
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

let flyingRunes: FlyingRune[] = [];
let isCastAnimating = false;
let discardingRunes: DiscardingRune[] = [];
let isDiscardAnimating = false;
let drawingRuneIds: string[] = [];

export function useFlyingRunes() { return useSyncExternalStore(subscribe, () => flyingRunes); }
export function useIsCastAnimating() { return useSyncExternalStore(subscribe, () => isCastAnimating); }
export function useDiscardingRunes() { return useSyncExternalStore(subscribe, () => discardingRunes); }
export function useIsDiscardAnimating() { return useSyncExternalStore(subscribe, () => isDiscardAnimating); }
export function useDrawingRuneIds() { return useSyncExternalStore(subscribe, () => drawingRuneIds); }

export interface DrawingRune {
    rune: RuneClientData;
    toX: number;
    toY: number;
    size: number;
    handIndex: number;
}

let drawingRunes: DrawingRune[] = [];

export function useDrawingRunes() { return useSyncExternalStore(subscribe, () => drawingRunes); }

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
        }, 450);
    });
}

function isAnimating() {
    return isCastAnimating || isDiscardAnimating;
}

function selectedIdsToServerIndices(): number[] {
    const out: number[] = [];
    for (const id of selectedRuneIds) {
        const idx = serverHand.findIndex(r => r.id === id);
        if (idx >= 0) out.push(idx);
    }
    return out;
}

// Returns the slot indices (0-based, in display order) of the runes that
// actually contribute to the resolved spell. For a single-element spell,
// that's the FIRST `tier` runes whose element matches the spell — so a
// Tier 1 Fire spell with [Fire, Water, Lightning] returns just [0], while a
// Tier 2 Fire spell with [Fire, Fire, Water, Lightning] returns [0, 1].
// For a combo spell, every rune matching one of the two combo elements
// contributes (combos require all played runes to be combo-compatible).
function getContributingRuneIndices(castRunes: RuneClientData[]): number[] {
    if (castRunes.length === 0) return [];
    const spell = resolveSpell(castRunes.map(r => ({ element: r.element })));
    if (!spell) return [];
    if (spell.isCombo && spell.comboElements) {
        const combo = spell.comboElements as readonly string[];
        const out: number[] = [];
        for (let i = 0; i < castRunes.length; i++) {
            if (combo.includes(castRunes[i].element)) out.push(i);
        }
        return out;
    }
    // Single-element: take the first `tier` runes whose element matches.
    const out: number[] = [];
    for (let i = 0; i < castRunes.length && out.length < spell.tier; i++) {
        if (castRunes[i].element === spell.element) out.push(i);
    }
    return out;
}

const FLY_DURATION_MS = 500;
const PLACE_SFX_STAGGER_MS = 100;

export function castSpell() {
    if (selectedRuneIds.length === 0 || isAnimating()) return;

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

    const serverIndices = selectedIdsToServerIndices();

    // Captured ordered list of cast runes for the dissolve animation.
    const castRunes = sortedSelected
        .map(idx => hand[idx])
        .filter((r): r is RuneClientData => r !== undefined);

    if (flying.length === 0) {
        // Fallback: no DOM elements found, just send immediately
        sendFn?.(ARKYN_CAST, { selectedIndices: serverIndices });
        selectedRuneIds = [];
        selectedIndices = [];
        notify();
        return;
    }

    flyingRunes = flying;
    isCastAnimating = true;
    selectedRuneIds = [];
    selectedIndices = [];
    // Remember the cast runes for the SpellPreview "Last Cast" view.
    lastCastRunes = castRunes;
    notify();

    // Resolve the spell on the client so we can compute per-rune damage
    // for the floating bubble UI. Uses the same shared formula as the
    // server, with the synced enemy resistances/weaknesses, so the numbers
    // we display always sum to the actual damage that will be applied.
    const resolvedSpell = resolveSpell(castRunes.map(r => ({ element: r.element })));
    const totalDamage = resolvedSpell
        ? calculateDamage(resolvedSpell, enemyResistances, enemyWeaknesses)
        : 0;

    // Phase 1: fly to the play area.
    setTimeout(() => {
        sendFn?.(ARKYN_CAST, { selectedIndices: serverIndices });
        flyingRunes = [];

        // Phase 2a: cards land in the play area as static runes. We mount
        // them in DissolveShader immediately but push the dissolve start
        // time into the future by RAISE_HOLD_MS so they read as fully
        // intact runes during the raise hold. Meanwhile, the slots whose
        // runes actually power the resolved spell get lifted via CSS so
        // the player can see which played runes mattered, and a floating
        // damage bubble blooms above each contributing rune.
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
            };
        }

        dissolvingRunes = castRunes;
        dissolveStartTime = performance.now() + RAISE_HOLD_MS;
        raisedSlotIndices = contributingIndices;
        runeDamageBubbles = bubbles;
        notify();

        // Play the "place rune" SFX once for each rune that actually
        // contributes to the resolved spell. Non-matching runes still fly
        // and dissolve visually but stay silent. Stagger so the sounds
        // layer instead of stacking into one thud.
        for (let i = 0; i < contributing; i++) {
            if (i === 0) playPlaceRune();
            else setTimeout(playPlaceRune, i * PLACE_SFX_STAGGER_MS);
        }

        // Phase 2b: when the raise hold ends and the dissolve actually
        // begins, fire the enemy health-bar damage hit (floating number +
        // shake). This synchronizes the enemy reaction with the moment
        // the runes start to be consumed.
        setTimeout(() => {
            enemyDamageHit = {
                amount: totalDamage,
                spellElement,
                seq: ++enemyDamageSeqCounter,
            };
            notify();
        }, RAISE_HOLD_MS);

        // Phase 3: wait for the raise hold + LAST staggered dissolve to
        // finish, then clear. The dissolves are themselves offset by
        // RAISE_HOLD_MS via dissolveStartTime, so the cleanup must wait
        // that long extra before tearing everything down.
        const totalDissolveMs =
            RAISE_HOLD_MS +
            (castRunes.length - 1) * DISSOLVE_STAGGER_MS +
            DISSOLVE_DURATION_MS;
        setTimeout(() => {
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
    if (selectedRuneIds.length === 0 || isAnimating()) return;

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

    const serverIndices = selectedIdsToServerIndices();

    if (discs.length === 0) {
        sendFn?.(ARKYN_DISCARD, { selectedIndices: serverIndices });
        selectedRuneIds = [];
        selectedIndices = [];
        notify();
        return;
    }

    discardingRunes = discs;
    isDiscardAnimating = true;
    selectedRuneIds = [];
    selectedIndices = [];
    notify();

    setTimeout(() => {
        sendFn?.(ARKYN_DISCARD, { selectedIndices: serverIndices });
        discardingRunes = [];
        isDiscardAnimating = false;
        notify();
    }, 400);
}

export function sendReady() {
    sendFn?.(ARKYN_READY, {});
}

export function joinGame() {
    sendFn?.(ARKYN_JOIN, {});
}

// ----- React hooks -----
export function useHand() { return useSyncExternalStore(subscribe, () => hand); }
export function useSelectedIndices() { return useSyncExternalStore(subscribe, () => selectedIndices); }
export function usePlayedRunes() { return useSyncExternalStore(subscribe, () => playedRunes); }
export function useEnemyName() { return useSyncExternalStore(subscribe, () => enemyName); }
export function useEnemyHp() { return useSyncExternalStore(subscribe, () => enemyHp); }
export function useEnemyMaxHp() { return useSyncExternalStore(subscribe, () => enemyMaxHp); }
export function useEnemyElement() { return useSyncExternalStore(subscribe, () => enemyElement); }
export function useEnemyResistances() { return useSyncExternalStore(subscribe, () => enemyResistances); }
export function useEnemyWeaknesses() { return useSyncExternalStore(subscribe, () => enemyWeaknesses); }
export function useGamePhase() { return useSyncExternalStore(subscribe, () => gamePhase); }
export function useLastSpellName() { return useSyncExternalStore(subscribe, () => lastSpellName); }
export function useLastSpellTier() { return useSyncExternalStore(subscribe, () => lastSpellTier); }
export function useLastDamage() { return useSyncExternalStore(subscribe, () => lastDamage); }
export function useCurrentRound() { return useSyncExternalStore(subscribe, () => currentRound); }
export function usePouchSize() { return useSyncExternalStore(subscribe, () => pouchSize); }
export function useCastsRemaining() { return useSyncExternalStore(subscribe, () => castsRemaining); }
export function useDiscardsRemaining() { return useSyncExternalStore(subscribe, () => discardsRemaining); }
