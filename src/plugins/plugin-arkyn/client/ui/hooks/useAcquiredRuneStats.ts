import { useMemo } from "react";
import { POUCH_SIZE } from "../../../shared";
import { useAcquiredRunes, useBanishedRunes, type RuneClientData } from "../../arkynStore";

export interface AcquiredRuneStats {
    acquiredRunes: readonly RuneClientData[];
    banishedRunes: readonly RuneClientData[];
    /**
     * Per-element count of runes added ON TOP of the starting pouch —
     * funnels both Rune Pack picks AND Magic Mirror duplicates together
     * (they're both permanent-across-rounds acquisitions).
     */
    bonusByElement: ReadonlyMap<string, number>;
    /**
     * Per-element count of runes permanently REMOVED from the deck
     * (Banish sigil, Tarot conversions, Tarot banish, Lovers fuse, etc.).
     * The PouchModal subtracts this from each element's row total so a
     * banished rune doesn't visually persist as a phantom "spent" slot.
     */
    banishedByElement: ReadonlyMap<string, number>;
    /** Starting pouch size (ELEMENT_TYPES.length * RUNES_PER_ELEMENT). */
    totalBase: number;
    /** Starting pouch + acquired − banished. Used by the modal so the
     *  pouch/hand/spent breakdown matches the live deck composition. */
    totalAll: number;
    totalBanished: number;
    /** Live deck size reflected in the pouch counter HUD:
     *  starting pouch + acquired − banished. */
    deckSize: number;
}

/**
 * Derives the shared acquired-rune accounting used by both `PouchModal`
 * (per-element counts + grid totals) and `PouchCounter` (deck size chip).
 * Centralizing here means the two UIs can't drift when we add a new
 * acquisition source (e.g. a future sigil that grants runes) — update the
 * hook, both surfaces update together.
 */
export function useAcquiredRuneStats(): AcquiredRuneStats {
    const acquiredRunes = useAcquiredRunes();
    const banishedRunes = useBanishedRunes();

    const bonusByElement = useMemo(() => {
        const m = new Map<string, number>();
        for (const r of acquiredRunes) {
            m.set(r.element, (m.get(r.element) ?? 0) + 1);
        }
        return m;
    }, [acquiredRunes]);

    const banishedByElement = useMemo(() => {
        const m = new Map<string, number>();
        for (const r of banishedRunes) {
            m.set(r.element, (m.get(r.element) ?? 0) + 1);
        }
        return m;
    }, [banishedRunes]);

    return {
        acquiredRunes,
        banishedRunes,
        bonusByElement,
        banishedByElement,
        totalBase: POUCH_SIZE,
        totalAll: POUCH_SIZE + acquiredRunes.length - banishedRunes.length,
        totalBanished: banishedRunes.length,
        deckSize: POUCH_SIZE + acquiredRunes.length - banishedRunes.length,
    };
}
