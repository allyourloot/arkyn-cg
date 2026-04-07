import { useSyncExternalStore } from "react";
import {
    MAX_PLAY,
    ARKYN_CAST,
    ARKYN_DISCARD,
    ARKYN_READY,
    ARKYN_JOIN,
    resolveSpell,
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

// The exact runes from the most recent cast. Persists between casts so the
// SpellPreview panel can re-resolve them and display the last cast result
// (element / description / combo info that the server doesn't sync).
let lastCastRunes: RuneClientData[] = [];

export function useLastCastRunes() {
    return useSyncExternalStore(subscribe, () => lastCastRunes);
}

export const DISSOLVE_DURATION_MS = 550;
export const DISSOLVE_STAGGER_MS = 150;

export function useDissolvingRunes() {
    return useSyncExternalStore(subscribe, () => dissolvingRunes);
}
export function useDissolveStartTime() {
    return useSyncExternalStore(subscribe, () => dissolveStartTime);
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

// Counts only the runes that actually contribute to the resolved spell.
// For a single-element spell that's the runes matching `spell.element`;
// for a combo spell that's every rune (since combos require all elements
// to be one of the two combo elements).
function countContributingRunes(castRunes: RuneClientData[]): number {
    if (castRunes.length === 0) return 0;
    const spell = resolveSpell(castRunes.map(r => ({ element: r.element })));
    if (!spell) return 0;
    if (spell.isCombo && spell.comboElements) {
        const combo = spell.comboElements as readonly string[];
        return castRunes.filter(r => combo.includes(r.element)).length;
    }
    return castRunes.filter(r => r.element === spell.element).length;
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

    // Phase 1: fly to the play area.
    setTimeout(() => {
        sendFn?.(ARKYN_CAST, { selectedIndices: serverIndices });
        flyingRunes = [];

        // Phase 2: cards land in the play area and start dissolving sequentially.
        dissolvingRunes = castRunes;
        dissolveStartTime = performance.now();
        notify();

        // Play the "place rune" SFX once for each rune that actually
        // contributes to the resolved spell. Non-matching runes still fly
        // and dissolve visually but stay silent. Stagger so the sounds
        // layer instead of stacking into one thud.
        const contributing = countContributingRunes(castRunes);
        for (let i = 0; i < contributing; i++) {
            if (i === 0) playPlaceRune();
            else setTimeout(playPlaceRune, i * PLACE_SFX_STAGGER_MS);
        }

        // Phase 3: wait for the LAST staggered dissolve to finish, then clear.
        const totalDissolveMs =
            (castRunes.length - 1) * DISSOLVE_STAGGER_MS + DISSOLVE_DURATION_MS;
        setTimeout(() => {
            dissolvingRunes = [];
            dissolveStartTime = 0;
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
