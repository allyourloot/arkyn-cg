import { useSyncExternalStore } from "react";
import { MAX_PLAY } from "../shared";
import { subscribe, notify, type RuneClientData } from "./arkynStoreCore";
import { playSelectRune, playDeselectRune } from "./sfx";

// ============================================================
// Arkyn data store
// ------------------------------------------------------------
// Owns the "data" half of the client store: hand, selection, enemy stats,
// game phase, played runes, pouch, action budgets, and the displayed-HP
// bar's lock/value.
//
// Sister modules:
//  - arkynStoreCore.ts   — pub-sub primitive + shared `RuneClientData` type
//  - arkynNetwork.ts     — server message senders
//  - arkynAnimations.ts  — animation state + cast/discard/draw orchestration
//
// To preserve the public API every existing UI file imports from
// `../arkynStore`, this file ALSO acts as the barrel that re-exports the
// other modules' public surfaces. New consumers can import from any of the
// sister files directly.
// ============================================================

// Re-export the shared type so consumers can keep using
// `import type { RuneClientData } from "../arkynStore"`.
export type { RuneClientData };

// ----- Store state -----

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
// Visual HP bar value — normally mirrors `enemyHp`, but during a cast
// animation it's frozen at its pre-cast value and only catches up when the
// enemy damage hit fires at the end of the dissolve. Decouples the visual
// impact moment from the server's (near-instant) HP update.
let displayedEnemyHp = 0;
let hpDisplayLocked = false;
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
// Full undrawn-rune list mirrored from the server. Used by the pouch modal
// to show what's still available to draw alongside the dimmed hand.
let pouchContents: RuneClientData[] = [];
let castsRemaining = 3;
let discardsRemaining = 3;
// The exact runes from the most recent cast. Persists between casts so the
// SpellPreview panel can re-resolve them and display the last cast result
// (element / description / combo info that the server doesn't sync).
let lastCastRunes: RuneClientData[] = [];

// ----- Setters (each notifies; called from sync system / actions) -----

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
export function setEnemyHp(hp: number) {
    enemyHp = hp;
    // Only drive the visual bar if we're not in the middle of a cast
    // animation — otherwise the cast orchestrator releases the lock at the
    // right moment so the bar drops in sync with the impact.
    if (!hpDisplayLocked) {
        displayedEnemyHp = hp;
    }
    notify();
}
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
export function setPouchContents(p: RuneClientData[]) { pouchContents = p; notify(); }
export function setCastsRemaining(c: number) { castsRemaining = c; notify(); }
export function setDiscardsRemaining(d: number) { discardsRemaining = d; notify(); }

export function clearSelectedIndices() {
    selectedRuneIds = [];
    selectedIndices = [];
    notify();
}

// ----- Selection actions -----

export function toggleRuneSelection(index: number) {
    const rune = hand[index];
    if (!rune) return;

    let changeKind: "select" | "deselect" | null = null;
    if (selectedRuneIds.includes(rune.id)) {
        selectedRuneIds = selectedRuneIds.filter(id => id !== rune.id);
        changeKind = "deselect";
    } else if (selectedRuneIds.length < MAX_PLAY) {
        selectedRuneIds = [...selectedRuneIds, rune.id];
        changeKind = "select";
    }
    if (changeKind === "select") playSelectRune();
    else if (changeKind === "deselect") playDeselectRune();
    recomputeSelectedIndices();
    notify();
}

// ----- Internal API for the animation orchestrator -----
//
// `arkynAnimations` needs to read selection/hand/enemy state and clear or
// lock parts of the store as part of the cast/discard choreography. The
// mutators here intentionally do NOT call notify() — the orchestrator
// batches multiple writes (animation state + store state) under one
// notify() call so consumers re-render exactly once per phase transition.

export const arkynStoreInternal = {
    // Snapshot accessors
    getHand: () => hand,
    getServerHand: () => serverHand,
    getSelectedRuneIds: () => selectedRuneIds,
    getSelectedIndices: () => selectedIndices,
    getEnemyHp: () => enemyHp,
    getEnemyResistances: () => enemyResistances,
    getEnemyWeaknesses: () => enemyWeaknesses,

    // Mutators (caller is responsible for calling notify() once per batch)
    clearSelection() {
        selectedRuneIds = [];
        selectedIndices = [];
    },
    setLastCastRunes(runes: RuneClientData[]) {
        lastCastRunes = runes;
    },
    lockHpDisplay() {
        hpDisplayLocked = true;
    },
    unlockHpDisplayAndSyncToServer() {
        hpDisplayLocked = false;
        displayedEnemyHp = enemyHp;
    },

    /**
     * Convert client selection (by rune id) into server-side hand indices.
     * Used by cast/discard right before sending the message to the server.
     */
    selectedIdsToServerIndices(): number[] {
        const out: number[] = [];
        for (const id of selectedRuneIds) {
            const idx = serverHand.findIndex(r => r.id === id);
            if (idx >= 0) out.push(idx);
        }
        return out;
    },
};

// ----- React hooks (data state) -----

export function useHand() { return useSyncExternalStore(subscribe, () => hand); }
export function useSelectedIndices() { return useSyncExternalStore(subscribe, () => selectedIndices); }
export function usePlayedRunes() { return useSyncExternalStore(subscribe, () => playedRunes); }
export function useEnemyName() { return useSyncExternalStore(subscribe, () => enemyName); }
export function useEnemyHp() { return useSyncExternalStore(subscribe, () => enemyHp); }
export function useDisplayedEnemyHp() { return useSyncExternalStore(subscribe, () => displayedEnemyHp); }
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
export function usePouchContents() { return useSyncExternalStore(subscribe, () => pouchContents); }
export function useCastsRemaining() { return useSyncExternalStore(subscribe, () => castsRemaining); }
export function useDiscardsRemaining() { return useSyncExternalStore(subscribe, () => discardsRemaining); }
export function useLastCastRunes() { return useSyncExternalStore(subscribe, () => lastCastRunes); }

// ============================================================
// Barrel re-exports
// ------------------------------------------------------------
// Every existing UI file imports from "../arkynStore" — re-exporting from
// the sister modules here keeps those imports working unchanged.
// ============================================================

export { subscribe } from "./arkynStoreCore";
export { setConnection, joinGame, sendReady } from "./arkynNetwork";
export {
    DISSOLVE_DURATION_MS,
    DISSOLVE_STAGGER_MS,
    SETTLE_DELAY_MS,
    BUBBLE_DURATION_MS,
    BUBBLE_STAGGER_MS,
    BUBBLE_TAIL_BUFFER_MS,
    ENEMY_DAMAGE_HIT_MS,
    triggerDrawAnimation,
    castSpell,
    discardRunes,
    useFlyingRunes,
    useIsCastAnimating,
    useDiscardingRunes,
    useIsDiscardAnimating,
    useDrawingRuneIds,
    useDrawingRunes,
    useDissolvingRunes,
    useDissolveStartTime,
    useRaisedSlotIndices,
    useRuneDamageBubbles,
    useEnemyDamageHit,
    useCastDamageCounter,
} from "./arkynAnimations";
export type {
    RuneDamageBubble,
    EnemyDamageHit,
    FlyingRune,
    DiscardingRune,
    DrawingRune,
} from "./arkynAnimations";
