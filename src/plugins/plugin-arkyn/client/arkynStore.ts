import { useSyncExternalStore } from "react";
import { ELEMENT_TYPES, MAX_PLAY } from "../shared";
import { subscribe, notify, type RuneClientData } from "./arkynStoreCore";
import { playSelectRune, playDeselectRune } from "./sfx";

// Canonical element order used by the hand sort for ties. Built once
// from ELEMENT_TYPES (which is alphabetical) so the rune pile sorts the
// same way every time and elements stay in a familiar order.
const ELEMENT_ORDER: Record<string, number> = (() => {
    const out: Record<string, number> = {};
    ELEMENT_TYPES.forEach((el, i) => {
        out[el] = i;
    });
    return out;
})();

/**
 * Pure sort helper used by both `sortHand` (the manual button) and
 * `setHand` (the auto-sort on every server-driven hand update). Returns
 * a fresh sorted copy of `arr` so callers can compare against the
 * original to decide whether anything changed.
 *
 * Sort order:
 *   1. Element COUNT descending — triples before pairs before singles.
 *   2. Element CANONICAL order (`ELEMENT_TYPES`).
 *   3. Rune ID — final stability tie-break so two runes of the same
 *      element keep a consistent relative order across re-sorts.
 */
function sortHandArray(arr: readonly RuneClientData[]): RuneClientData[] {
    if (arr.length < 2) return [...arr];
    const counts = new Map<string, number>();
    for (const r of arr) {
        counts.set(r.element, (counts.get(r.element) ?? 0) + 1);
    }
    return [...arr].sort((a, b) => {
        const countDiff = (counts.get(b.element) ?? 0) - (counts.get(a.element) ?? 0);
        if (countDiff !== 0) return countDiff;
        const orderDiff =
            (ELEMENT_ORDER[a.element] ?? Number.MAX_SAFE_INTEGER) -
            (ELEMENT_ORDER[b.element] ?? Number.MAX_SAFE_INTEGER);
        if (orderDiff !== 0) return orderDiff;
        return a.id.localeCompare(b.id);
    });
}

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
// Persistent currency. `gold` is the running total banked across rounds.
// The `lastRoundGold*` fields mirror the server-side reward breakdown for
// the most recent enemy defeat — `RoundEndOverlay` reads them to play the
// typewriter reward animation.
let gold = 0;
let lastRoundGoldBase = 0;
let lastRoundGoldHandsBonus = 0;
let lastRoundGoldHandsCount = 0;
// The exact runes from the most recent cast. Persists between casts so the
// SpellPreview panel can re-resolve them and display the last cast result
// (element / description / combo info that the server doesn't sync).
let lastCastRunes: RuneClientData[] = [];

// Run stats — synced from server for the game-over screen.
let runTotalDamage = 0;
let runTotalCasts = 0;
let runTotalDiscards = 0;
let runHighestSingleCast = 0;
let runFavoriteSpell = "";
let runEnemiesDefeated = 0;
let runGoldEarned = 0;

// Personal bests — loaded from save data on join.
let bestRound = 0;
let bestSingleCast = 0;

// ----- Setters (each notifies; called from sync system / actions) -----

export function setHand(h: RuneClientData[]) {
    serverHand = h;

    // Auto-sort on every hand update so freshly drawn runes land
    // adjacent to their kin (poker-shape readability). The manual
    // drag-reorder still works between syncs — it just gets reset on
    // the next draw, which is the explicit user-facing contract.
    //
    // Note: this also overwrites the player's current manual ordering
    // on every cast/discard refill, but that's the intended behavior
    // for "always sorted". `triggerDrawAnimation` looks up indices via
    // `getHandIndex` AFTER this commit, so the new runes still fly to
    // their (now sorted) target slots correctly.
    hand = sortHandArray(h);

    // Drop selection entries whose runes no longer exist.
    const newIds = new Set(h.map(r => r.id));
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
    // Sort ascending so `selectedIndices` always reads in display-hand
    // order, not in click-order. SpellPreview uses this to feed runes
    // to `resolveSpell`, which uses encounter order as its primary-
    // element tie-break — so a 2-Air + 2-Poison hand should preview
    // as Wind Slash regardless of which pair the player clicked first
    // (Air sits in the earlier slots). The cast pipeline already
    // re-sorts defensively (`arkynAnimations.ts` line 277), but
    // anchoring the canonical store value here keeps every consumer
    // — preview, cast animation, server payload — in lockstep.
    next.sort((a, b) => a - b);
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

/**
 * Manual hand sort triggered by the Sort button. Mostly redundant
 * since `setHand` auto-sorts on every server sync, but useful as an
 * explicit "snap to sorted" after the player has manually dragged
 * runes around. Also gives the player a tactile re-sort affordance.
 *
 * Selection follows the runes (selectedRuneIds is the source of truth)
 * so re-sorting doesn't lose the player's current pick.
 */
export function sortHand() {
    if (hand.length < 2) return;
    const next = sortHandArray(hand);

    // Bail if the order didn't actually change so the click doesn't
    // notify subscribers (and re-trigger the HandDisplay GSAP layout
    // pass) for nothing.
    let changed = false;
    for (let i = 0; i < next.length; i++) {
        if (next[i].id !== hand[i].id) {
            changed = true;
            break;
        }
    }
    if (!changed) return;

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
export function setGold(g: number) { gold = g; notify(); }
export function setLastRoundGoldBase(g: number) { lastRoundGoldBase = g; notify(); }
export function setLastRoundGoldHandsBonus(g: number) { lastRoundGoldHandsBonus = g; notify(); }
export function setLastRoundGoldHandsCount(c: number) { lastRoundGoldHandsCount = c; notify(); }

// Run stats setters
export function setRunTotalDamage(d: number) { runTotalDamage = d; notify(); }
export function setRunTotalCasts(c: number) { runTotalCasts = c; notify(); }
export function setRunTotalDiscards(d: number) { runTotalDiscards = d; notify(); }
export function setRunHighestSingleCast(d: number) { runHighestSingleCast = d; notify(); }
export function setRunFavoriteSpell(s: string) { runFavoriteSpell = s; notify(); }
export function setRunEnemiesDefeated(n: number) { runEnemiesDefeated = n; notify(); }
export function setRunGoldEarned(g: number) { runGoldEarned = g; notify(); }
export function setBestRound(r: number) { bestRound = r; notify(); }
export function setBestSingleCast(d: number) { bestSingleCast = d; notify(); }

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
     *
     * Iterates the SORTED display-hand `selectedIndices` (not the
     * click-order `selectedRuneIds`) so the server receives the runes
     * in the same order the player sees them in their hand. This
     * matters because `resolveSpell`'s primary-element tie-break uses
     * encounter order — without this, casting 2-Air + 2-Poison after
     * clicking the Poison pair first would resolve to Venom Strike on
     * the server while the client preview already showed Wind Slash.
     */
    selectedIdsToServerIndices(): number[] {
        const out: number[] = [];
        for (const handIdx of selectedIndices) {
            const rune = hand[handIdx];
            if (!rune) continue;
            const serverIdx = serverHand.findIndex(r => r.id === rune.id);
            if (serverIdx >= 0) out.push(serverIdx);
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
export function useGold() { return useSyncExternalStore(subscribe, () => gold); }
export function useLastRoundGoldBase() { return useSyncExternalStore(subscribe, () => lastRoundGoldBase); }
export function useLastRoundGoldHandsBonus() { return useSyncExternalStore(subscribe, () => lastRoundGoldHandsBonus); }
export function useLastRoundGoldHandsCount() { return useSyncExternalStore(subscribe, () => lastRoundGoldHandsCount); }

// Run stats hooks
export function useRunTotalDamage() { return useSyncExternalStore(subscribe, () => runTotalDamage); }
export function useRunTotalCasts() { return useSyncExternalStore(subscribe, () => runTotalCasts); }
export function useRunTotalDiscards() { return useSyncExternalStore(subscribe, () => runTotalDiscards); }
export function useRunHighestSingleCast() { return useSyncExternalStore(subscribe, () => runHighestSingleCast); }
export function useRunFavoriteSpell() { return useSyncExternalStore(subscribe, () => runFavoriteSpell); }
export function useRunEnemiesDefeated() { return useSyncExternalStore(subscribe, () => runEnemiesDefeated); }
export function useRunGoldEarned() { return useSyncExternalStore(subscribe, () => runGoldEarned); }
export function useBestRound() { return useSyncExternalStore(subscribe, () => bestRound); }
export function useBestSingleCast() { return useSyncExternalStore(subscribe, () => bestSingleCast); }

// ============================================================
// Barrel re-exports
// ------------------------------------------------------------
// Every existing UI file imports from "../arkynStore" — re-exporting from
// the sister modules here keeps those imports working unchanged.
// ============================================================

export { subscribe } from "./arkynStoreCore";
export { setConnection, joinGame, sendReady, sendNewRun } from "./arkynNetwork";
export {
    DISSOLVE_DURATION_MS,
    DISSOLVE_STAGGER_MS,
    SETTLE_DELAY_MS,
    BUBBLE_DURATION_MS,
    BUBBLE_STAGGER_MS,
    BUBBLE_TAIL_BUFFER_MS,
    ENEMY_DAMAGE_HIT_MS,
    RAISE_LIFT_PX,
    SLOT_RAISE_S,
    SLOT_LOWER_S,
    BAR_SHAKE_FRAME_S,
    RUNE_SHAKE_FRAME_S,
    triggerDrawAnimation,
    castSpell,
    discardRunes,
    getIsCastAnimating,
    clearCastingRuneIds,
    useFlyingRunes,
    useIsCastAnimating,
    useCastingRuneIds,
    useDiscardingRunes,
    useIsDiscardAnimating,
    useDrawingRuneIds,
    useDrawingRunes,
    useDissolvingRunes,
    useDissolveStartTime,
    useRaisedSlotIndices,
    useRuneDamageBubbles,
    useEnemyDamageHit,
    useCastBaseCounter,
    useCastTotalDamage,
    useLastCastBaseDamage,
} from "./arkynAnimations";
export type {
    RuneDamageBubble,
    EnemyDamageHit,
    FlyingRune,
    DiscardingRune,
    DrawingRune,
} from "./arkynAnimations";
