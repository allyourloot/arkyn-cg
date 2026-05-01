import { useSyncExternalStore } from "react";
import { subscribe, notify } from "./arkynStoreCore";

/**
 * Client-side mirror of the achievement-related schema fields the server
 * pushes onto `ArkynPlayerState`. Kept in its own module so the central
 * arkynStore stays focused on gameplay state — this layer only feeds
 * the AchievementFlyout and AchievementsModal.
 */

export interface AchievementFlyoutData {
    seq: number;
    id: string;
    name: string;
    description: string;
    /** "" if no sigil unlock attached. */
    unlocksSigilId: string;
}

export interface LifetimeStatsSnapshot {
    totalCasts: number;
    totalDiscards: number;
    totalRuns: number;
    totalEnemiesDefeated: number;
    totalGoldEarned: number;
    runePacksOpened: number;
    auguryPacksOpened: number;
    sigilsSold: number;
    /** Bitmask over ELEMENT_TYPES (bit i set = at least one cast of that element). */
    elementsCastMask: number;
}

let pendingAchievementFlyouts: AchievementFlyoutData[] = [];
let unlockedAchievements: string[] = [];
let lifetime: LifetimeStatsSnapshot = {
    totalCasts: 0,
    totalDiscards: 0,
    totalRuns: 0,
    totalEnemiesDefeated: 0,
    totalGoldEarned: 0,
    runePacksOpened: 0,
    auguryPacksOpened: 0,
    sigilsSold: 0,
    elementsCastMask: 0,
};

// ---- Setters (called from syncArkynState) ----

export function setPendingAchievementFlyouts(arr: AchievementFlyoutData[]): void {
    pendingAchievementFlyouts = arr;
    notify();
}

export function setUnlockedAchievements(arr: string[]): void {
    unlockedAchievements = arr;
    notify();
}

export function setLifetimeStats(snap: LifetimeStatsSnapshot): void {
    lifetime = snap;
    notify();
}

// ---- Hooks ----

export function usePendingAchievementFlyouts(): AchievementFlyoutData[] {
    return useSyncExternalStore(subscribe, () => pendingAchievementFlyouts);
}

/** Convenience: read just the head of the queue, the one to render. */
export function useAchievementFlyoutHead(): AchievementFlyoutData | null {
    return useSyncExternalStore(subscribe, () => pendingAchievementFlyouts[0] ?? null);
}

export function useUnlockedAchievements(): string[] {
    return useSyncExternalStore(subscribe, () => unlockedAchievements);
}

export function useLifetimeStats(): LifetimeStatsSnapshot {
    return useSyncExternalStore(subscribe, () => lifetime);
}
