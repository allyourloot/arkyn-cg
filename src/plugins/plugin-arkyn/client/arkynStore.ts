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
 * Pure sort helper used by `setHand` (auto-sort on every server-driven
 * hand update). Returns a fresh sorted copy of `arr` so callers can
 * compare against the original to decide whether anything changed.
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
let enemyIsBoss = false;
let enemyDebuff = "";
let handSize = 8;
let runSeed = 0;
let gamePhase = "menu";
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
// Visual gold counter value — normally mirrors `gold`, but during a cast
// animation it's frozen at its pre-cast value and ticks up per proc commit
// so the displayed gain lines up with the "+N Gold" bubbles instead of
// jumping instantly when the server's schema patch arrives.
let displayedGold = 0;
let goldDisplayLocked = false;
// Latest gold-proc "+N" overlay to render near the gold counter. Replaced
// (with a fresh `seq`) on each proc so the pop animation re-fires. The
// value update is applied separately via `addDisplayedGold` a beat later
// so the player reads the "+N" before the counter increments.
let goldProcBubble: { amount: number; seq: number } | null = null;
let goldProcSeq = 0;
let lastRoundGoldBase = 0;
let lastRoundGoldHandsBonus = 0;
let lastRoundGoldHandsCount = 0;
let lastRoundGoldSigilBonus = 0;
// The exact runes from the most recent cast. Persists between casts so the
// SpellPreview panel can re-resolve them and display the last cast result
// (element / description / combo info that the server doesn't sync).
let lastCastRunes: RuneClientData[] = [];

// Scroll upgrade levels per element and current shop inventory.
export type ShopItemClientData = {
    itemType: string;
    element: string;
    cost: number;
    purchased: boolean;
};
let scrollLevels: Map<string, number> = new Map();
let shopItems: ShopItemClientData[] = [];

// Sigils owned this run — array of sigil IDs.
let sigils: string[] = [];

// Per-sigil persistent accumulator values (Executioner xMult, etc.).
// Mirrors `player.sigilAccumulators`. Keys are sigil IDs; missing keys
// fall back to the category's `initialValue` at read time.
let sigilAccumulators: Record<string, number> = {};

// Consumable items — array of element names (scroll consumables).
let consumables: string[] = [];

// Element whose enemy resistance is nullified this round by Binoculars (or
// any future dynamic resist-ignore sigil). Mirrors player.disabledResistance
// on the server. Empty string = no disabled resistance.
let disabledResistance = "";

// Element that Ahoy rolled for this round — discarding runes of this
// element earns bonus gold. Mirrors player.ahoyDiscardElement on the
// server. Empty string = no active ahoy element (Ahoy not owned).
let ahoyDiscardElement = "";

// Runes acquired this run from Rune Bag picks. These are rehydrated into
// the pouch every round on the server side; the client mirrors the list
// so PouchModal can show the extra slots (with real rarity art) and
// PouchCounter can grow its denominator past 52.
let acquiredRunes: RuneClientData[] = [];

// In-flight Rune Bag picker state. Non-empty -> the player has just
// bought a bag; ShopScreen hides its Sigils/Consumables panel and the
// Next Round button, then shows the picker with these 4 runes.
let pendingBagRunes: RuneClientData[] = [];

// Runes permanently banished this run (Banish sigil). Mirrored from the
// server so PouchCounter can shrink its denominator and future UI
// (e.g. a "Banished Runes" row in PouchModal) can enumerate them.
let banishedRunes: RuneClientData[] = [];

// How many discards the player has used this round. Mirrors
// `player.discardsUsedThisRound`. The client reads this pre-discard to
// predict whether a discard-hook sigil (Banish) would proc, so it can
// swap the standard discard animation for a dissolve + gold-bubble
// celebration without waiting on the server echo.
let discardsUsedThisRound = 0;

// Same counter on the cast side. Used by `castSpell` to preview cast-hook
// sigils (Magic Mirror) and inject predicted hand mutations locally
// before the cast animation starts.
let castsUsedThisRound = 0;

// The rune currently playing the reverse-dissolve "materialize" animation
// (Magic Mirror's duplicate rune at the proc moment). HandDisplay renders
// this rune's slot as a `<DissolveCanvas reverse>` for `duration` ms
// instead of the normal rune card, then the store clears this field and
// the slot falls back to the standard card render.
let materializingRune: { id: string; startTime: number; duration: number } | null = null;

// Per-sigil proc bubble — renders a floating overlay anchored to the
// matching sigil's SigilBar slot. Single active bubble at a time (new
// procs replace the old); monotonic `seq` forces a fresh React mount
// so GSAP replays the pop animation on back-to-back procs.
// Kinds:
//   - "gold":  "+N [gold icon]" (Fortune / Banish grants).
//   - "xmult": "+N.Nx" in a red-bg / white-text pill (Executioner's
//              accumulator increment per critical hit).
let sigilProcBubble: { sigilId: string; amount: number; kind: "gold" | "xmult"; seq: number } | null = null;
let sigilProcSeq = 0;

// Blackjack execute animation — fullscreen-centered 13-frame spritesheet
// that plays when Blackjack's execute proc fires during a cast. Single
// active animation at a time; monotonic `seq` forces the component to
// remount so the spritesheet restarts from frame 1 on back-to-back procs.
// Cleared by the animation component itself after the last frame.
let blackjackAnimation: { seq: number } | null = null;
let blackjackAnimationSeq = 0;

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

export function getHandIndex(runeId: string): number {
    return hand.findIndex(r => r.id === runeId);
}

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
export function setEnemyIsBoss(b: boolean) { enemyIsBoss = b; notify(); }
export function setEnemyDebuff(d: string) { enemyDebuff = d; notify(); }
export function setHandSize(s: number) { handSize = s; notify(); }
export function setRunSeed(s: number) { runSeed = s; notify(); }
export function setGamePhase(p: string) { gamePhase = p; notify(); }
export function setLastSpellName(n: string) { lastSpellName = n; notify(); }
export function setLastSpellTier(t: number) { lastSpellTier = t; notify(); }
export function setLastDamage(d: number) { lastDamage = d; notify(); }
export function setCurrentRound(r: number) { currentRound = r; notify(); }
export function setPouchSize(s: number) { pouchSize = s; notify(); }
export function setPouchContents(p: RuneClientData[]) { pouchContents = p; notify(); }
export function setCastsRemaining(c: number) { castsRemaining = c; notify(); }
export function setDiscardsRemaining(d: number) { discardsRemaining = d; notify(); }
export function setGold(g: number) {
    gold = g;
    // Only drive the visual counter if we're not mid-cast — during a cast
    // the timeline ticks `displayedGold` per proc via `addDisplayedGold`
    // so the counter increments in sync with the "+N Gold" bubble. On
    // cast complete the orchestrator calls `unlockGoldDisplayAndSync` which
    // syncs `displayedGold` back to `gold` in case of any drift.
    if (!goldDisplayLocked) {
        displayedGold = g;
    }
    notify();
}
export function setLastRoundGoldBase(g: number) { lastRoundGoldBase = g; notify(); }
export function setLastRoundGoldHandsBonus(g: number) { lastRoundGoldHandsBonus = g; notify(); }
export function setLastRoundGoldHandsCount(c: number) { lastRoundGoldHandsCount = c; notify(); }
export function setLastRoundGoldSigilBonus(g: number) { lastRoundGoldSigilBonus = g; notify(); }

// Scroll / shop setters
export function setScrollLevels(levels: Map<string, number>) { scrollLevels = levels; notify(); }
export function setShopItems(items: ShopItemClientData[]) { shopItems = items; notify(); }

// Sigil setters
export function setSigils(s: string[]) { sigils = s; notify(); }
export function setSigilAccumulators(a: Record<string, number>) { sigilAccumulators = a; notify(); }

// Consumable setters
export function setConsumables(c: string[]) { consumables = c; notify(); }

// Dynamic resist-ignore setter — synced from player.disabledResistance.
export function setDisabledResistance(e: string) { disabledResistance = e; notify(); }

// Ahoy's per-round element setter — synced from player.ahoyDiscardElement.
export function setAhoyDiscardElement(e: string) { ahoyDiscardElement = e; notify(); }

// Rune Bag setters
export function setAcquiredRunes(r: RuneClientData[]) { acquiredRunes = r; notify(); }
export function setPendingBagRunes(r: RuneClientData[]) { pendingBagRunes = r; notify(); }
export function setBanishedRunes(r: RuneClientData[]) { banishedRunes = r; notify(); }

/**
 * Append a single rune to the per-run `acquiredRunes` list client-side.
 * Used by Magic Mirror's cast-hook prediction so PouchCounter /
 * PouchModal reflect the new rune at the moment of cast rather than
 * lagging until the server echo lands. The next `setAcquiredRunes`
 * from server sync overwrites with the authoritative list — because
 * the prediction uses the same deterministic id (`mirror-${source.id}`)
 * the server generates, there's no visible churn.
 */
export function appendAcquiredRune(rune: RuneClientData) {
    acquiredRunes = [...acquiredRunes, rune];
    notify();
}
export function setDiscardsUsedThisRound(n: number) { discardsUsedThisRound = n; notify(); }
export function setCastsUsedThisRound(n: number) { castsUsedThisRound = n; notify(); }

/**
 * Append a single rune to the hand WITHOUT triggering the normal sort —
 * preserving insertion order. Used exclusively by Magic Mirror's cast-hook
 * prediction so the duplicate visibly lands at the END of the hand
 * (matching the "mirror copy pops in at the right edge" UX). The next
 * full `setHand(...)` from server sync will sort the hand as usual.
 */
export function appendHandRune(rune: RuneClientData) {
    hand = [...hand, rune];
    serverHand = [...serverHand, rune];
    recomputeSelectedIndices();
    notify();
}

export function setMaterializingRune(r: { id: string; startTime: number; duration: number } | null) {
    materializingRune = r;
    notify();
}

// Scroll purchase event — lightweight pub-sub. ShopScreen fires this on
// buy; ArkynOverlay orchestrates the fly/shake/dissolve animation and
// ShopPanel shows the upgrade display.
export type ScrollPurchaseEvent = {
    element: string;
    oldLevel: number;
    newLevel: number;
    fromRect: DOMRect; // bounding rect of the scroll image in the shop card
};

// Active upgrade display — set by the animation orchestrator at the right
// moment in the GSAP timeline so ShopPanel renders the upgrade section.
export type ScrollUpgradeDisplayData = { element: string; oldLevel: number; newLevel: number } | null;
let scrollUpgradeDisplay: ScrollUpgradeDisplayData = null;
export function setScrollUpgradeDisplay(d: ScrollUpgradeDisplayData) { scrollUpgradeDisplay = d; notify(); }
export function useScrollUpgradeDisplay() { return useSyncExternalStore(subscribe, () => scrollUpgradeDisplay); }
type ScrollPurchaseListener = (e: ScrollPurchaseEvent) => void;
const scrollPurchaseListeners = new Set<ScrollPurchaseListener>();
export function onScrollPurchase(fn: ScrollPurchaseListener) {
    scrollPurchaseListeners.add(fn);
    return () => { scrollPurchaseListeners.delete(fn); };
}
export function emitScrollPurchase(e: ScrollPurchaseEvent) {
    scrollPurchaseListeners.forEach(fn => fn(e));
}

// Sigil purchase event — same pattern as scroll purchase.
// ShopScreen fires on buy; ArkynOverlay flies the sigil to its bar slot.
export type SigilPurchaseEvent = {
    sigilId: string;
    fromRect: DOMRect;
};
type SigilPurchaseListener = (e: SigilPurchaseEvent) => void;
const sigilPurchaseListeners = new Set<SigilPurchaseListener>();
export function onSigilPurchase(fn: SigilPurchaseListener) {
    sigilPurchaseListeners.add(fn);
    return () => { sigilPurchaseListeners.delete(fn); };
}
export function emitSigilPurchase(e: SigilPurchaseEvent) {
    sigilPurchaseListeners.forEach(fn => fn(e));
}

// Bag-rune pick event — fired from RuneBagPicker's Select button. The
// ArkynOverlay listens and flies the picked rune to the PouchCounter
// icon in the bottom-right. Mirrors the sigil/scroll purchase event
// pattern so the animation layer stays decoupled from the picker UI.
export type BagRunePickEvent = {
    rune: RuneClientData;
    fromRect: DOMRect;
};
type BagRunePickListener = (e: BagRunePickEvent) => void;
const bagRunePickListeners = new Set<BagRunePickListener>();
export function onBagRunePick(fn: BagRunePickListener) {
    bagRunePickListeners.add(fn);
    return () => { bagRunePickListeners.delete(fn); };
}
export function emitBagRunePick(e: BagRunePickEvent) {
    bagRunePickListeners.forEach(fn => fn(e));
}

// Sigil slot rect registry — SigilBar writes, ArkynOverlay reads.
// The frame element is registered separately so `getSigilSlotRect` can
// compute the target rect for a not-yet-mounted slot (e.g. the in-flight
// purchase lands on an index that only appears in the DOM after the
// server echo, which arrives after the fly animation has already started).
const sigilSlotElements: (HTMLElement | null)[] = [];
let sigilFrameElement: HTMLElement | null = null;
export function registerSigilSlot(index: number, el: HTMLElement | null) {
    sigilSlotElements[index] = el;
}
export function registerSigilFrame(el: HTMLElement | null) {
    sigilFrameElement = el;
}
export function getSigilSlotRect(index: number): DOMRect | null {
    const direct = sigilSlotElements[index];
    if (direct) return direct.getBoundingClientRect();

    // Slot isn't mounted yet — infer its rect from the frame's layout.
    // Happens when a sigil purchase fires before the server echo adds
    // the new sigil to `sigils` (the SigilBar render that would mount
    // this slot). Pack sigils from the left with known slot width + gap.
    const frame = sigilFrameElement;
    if (!frame) return null;
    const frameRect = frame.getBoundingClientRect();
    const frameStyle = getComputedStyle(frame);
    const paddingLeft = parseFloat(frameStyle.paddingLeft) || 0;
    const paddingTop = parseFloat(frameStyle.paddingTop) || 0;
    const paddingBottom = parseFloat(frameStyle.paddingBottom) || 0;
    const gap = parseFloat(frameStyle.columnGap || frameStyle.rowGap || "0") || 0;

    // Find any registered sibling — its measured size is authoritative.
    let sample: { el: HTMLElement; index: number } | null = null;
    for (let i = 0; i < sigilSlotElements.length; i++) {
        const el = sigilSlotElements[i];
        if (el) { sample = { el, index: i }; break; }
    }

    if (sample) {
        const sampleRect = sample.el.getBoundingClientRect();
        const stride = sampleRect.width + gap;
        return new DOMRect(
            sampleRect.left + (index - sample.index) * stride,
            sampleRect.top,
            sampleRect.width,
            sampleRect.height,
        );
    }

    // Empty bar — no sibling to sample. Approximate the slot as a
    // square sized to the frame's inner height. Good enough for the
    // first-sigil edge case; the fly animation finishes with a fade.
    const slotSize = frameRect.height - paddingTop - paddingBottom;
    return new DOMRect(
        frameRect.left + paddingLeft + index * (slotSize + gap),
        frameRect.top + paddingTop,
        slotSize,
        slotSize,
    );
}

// Pending-sigil signal — set while a sigil purchase flight is in the
// air. SigilBar hides that sigil's slot until the flyer lands, so the
// slot doesn't pop in early when the server echoes the purchase.
let pendingSigilId: string | null = null;
export function setPendingSigilId(id: string | null) {
    if (pendingSigilId === id) return;
    pendingSigilId = id;
    notify();
}
export function usePendingSigilId() {
    return useSyncExternalStore(subscribe, () => pendingSigilId);
}

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
    getScrollLevels: () => scrollLevels,
    getSigils: () => sigils,
    getSigilAccumulators: () => sigilAccumulators,
    getDisabledResistance: () => disabledResistance,
    getAhoyDiscardElement: () => ahoyDiscardElement,
    getCastsRemaining: () => castsRemaining,
    getCurrentRound: () => currentRound,
    getRunSeed: () => runSeed,
    getDiscardsUsedThisRound: () => discardsUsedThisRound,
    getCastsUsedThisRound: () => castsUsedThisRound,
    getHandSize: () => handSize,

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
    lockGoldDisplay() {
        goldDisplayLocked = true;
    },
    unlockGoldDisplayAndSyncToServer() {
        goldDisplayLocked = false;
        displayedGold = gold;
    },
    /**
     * Tick the displayed gold counter by `amount`. Called by the cast
     * timeline's gold-proc commit event (after the "+N Gold" bubble has
     * already appeared) so the counter increments visibly in sync with
     * the proc payout. Clamped against `gold` so if the server's schema
     * patch hasn't arrived yet we don't over-display.
     */
    addDisplayedGold(amount: number) {
        displayedGold = Math.min(gold, displayedGold + amount);
    },
    /**
     * Trigger the floating "+N" overlay over the gold counter. The
     * monotonic `seq` forces a React remount so the pop animation
     * replays even on back-to-back procs.
     */
    triggerGoldProcBubble(amount: number) {
        goldProcBubble = { amount, seq: ++goldProcSeq };
    },
    /** Clear the overlay after the cast timeline completes. */
    clearGoldProcBubble() {
        goldProcBubble = null;
    },
    /**
     * Show a floating proc bubble (currently gold-only) over a specific
     * sigil slot in the SigilBar. Used by Banish's on-proc UX to surface
     * the reward visually on the sigil that fired it, in parallel with
     * (or in place of) the GoldCounter's own "+N" overlay. Fresh `seq`
     * remounts the bubble so back-to-back procs replay the animation.
     */
    triggerSigilProcBubble(sigilId: string, amount: number, kind: "gold" | "xmult" = "gold") {
        sigilProcBubble = { sigilId, amount, kind, seq: ++sigilProcSeq };
    },
    clearSigilProcBubble() {
        sigilProcBubble = null;
    },

    /**
     * Fire the Blackjack spritesheet + SFX. Called by the cast timeline
     * when an execute proc event lands. Monotonic `seq` forces a fresh
     * React mount so the component restarts from frame 1 even when
     * back-to-back procs fire within the same cast (e.g. two played
     * Death runes both rolling the 1-in-21 execute).
     */
    triggerBlackjackAnimation() {
        blackjackAnimation = { seq: ++blackjackAnimationSeq };
    },
    /** Called by the animation component after the last frame finishes. */
    clearBlackjackAnimation() {
        blackjackAnimation = null;
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
export function useEnemyName() { return useSyncExternalStore(subscribe, () => enemyName); }
export function useEnemyHp() { return useSyncExternalStore(subscribe, () => enemyHp); }
export function useDisplayedEnemyHp() { return useSyncExternalStore(subscribe, () => displayedEnemyHp); }
export function useEnemyMaxHp() { return useSyncExternalStore(subscribe, () => enemyMaxHp); }
export function useEnemyElement() { return useSyncExternalStore(subscribe, () => enemyElement); }
export function useEnemyResistances() { return useSyncExternalStore(subscribe, () => enemyResistances); }
export function useEnemyWeaknesses() { return useSyncExternalStore(subscribe, () => enemyWeaknesses); }
export function useEnemyIsBoss() { return useSyncExternalStore(subscribe, () => enemyIsBoss); }
export function useEnemyDebuff() { return useSyncExternalStore(subscribe, () => enemyDebuff); }
export function useHandSize() { return useSyncExternalStore(subscribe, () => handSize); }
export function useRunSeed() { return useSyncExternalStore(subscribe, () => runSeed); }
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
/**
 * Read the display-frozen gold value. During a cast the counter stays at
 * its pre-cast value and is bumped per proc by the cast timeline; outside
 * of a cast it mirrors `gold` exactly.
 */
export function useDisplayedGold() { return useSyncExternalStore(subscribe, () => displayedGold); }
/** Read the latest gold-proc overlay bubble (seq-keyed). */
export function useGoldProcBubble() { return useSyncExternalStore(subscribe, () => goldProcBubble); }
export function useLastRoundGoldBase() { return useSyncExternalStore(subscribe, () => lastRoundGoldBase); }
export function useLastRoundGoldHandsBonus() { return useSyncExternalStore(subscribe, () => lastRoundGoldHandsBonus); }
export function useLastRoundGoldHandsCount() { return useSyncExternalStore(subscribe, () => lastRoundGoldHandsCount); }
export function useLastRoundGoldSigilBonus() { return useSyncExternalStore(subscribe, () => lastRoundGoldSigilBonus); }

// Scroll / shop hooks
export function useScrollLevels() { return useSyncExternalStore(subscribe, () => scrollLevels); }
export function useShopItems() { return useSyncExternalStore(subscribe, () => shopItems); }

// Sigil hooks
export function useSigils() { return useSyncExternalStore(subscribe, () => sigils); }
export function useSigilAccumulators() { return useSyncExternalStore(subscribe, () => sigilAccumulators); }

// Consumable hooks
export function useConsumables() { return useSyncExternalStore(subscribe, () => consumables); }

// Dynamic resist-ignore hook — the element (if any) that Binoculars picked
// for this round. Empty string when no dynamic ignore is active.
export function useDisabledResistance() { return useSyncExternalStore(subscribe, () => disabledResistance); }

// Ahoy's per-round element hook — the element (if any) Ahoy rolled this
// round. Empty string when Ahoy isn't owned or hasn't rolled yet.
export function useAhoyDiscardElement() { return useSyncExternalStore(subscribe, () => ahoyDiscardElement); }

// Rune Bag hooks
export function useAcquiredRunes() { return useSyncExternalStore(subscribe, () => acquiredRunes); }
export function usePendingBagRunes() { return useSyncExternalStore(subscribe, () => pendingBagRunes); }
export function useBanishedRunes() { return useSyncExternalStore(subscribe, () => banishedRunes); }
export function useDiscardsUsedThisRound() { return useSyncExternalStore(subscribe, () => discardsUsedThisRound); }
export function useCastsUsedThisRound() { return useSyncExternalStore(subscribe, () => castsUsedThisRound); }
export function useMaterializingRune() { return useSyncExternalStore(subscribe, () => materializingRune); }
export function useSigilProcBubble() { return useSyncExternalStore(subscribe, () => sigilProcBubble); }
export function useBlackjackAnimation() { return useSyncExternalStore(subscribe, () => blackjackAnimation); }

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
export { setConnection, joinGame, sendReady, sendCollectRoundGold, sendNewRun, sendBuyItem, sendSellSigil, sendReorderSigils, sendUseConsumable, sendBagChoice, sendRerollShop } from "./arkynNetwork";
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
    clearLastCastState,
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
    useRoundTotalDamage,
    useProcDamageBubbles,
    useActiveSigilShake,
} from "./arkynAnimations";
export type {
    RuneDamageBubble,
    EnemyDamageHit,
    FlyingRune,
    DiscardingRune,
    DrawingRune,
} from "./arkynAnimations";
