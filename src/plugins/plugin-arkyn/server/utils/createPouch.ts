import { ELEMENT_TYPES, RUNES_PER_ELEMENT } from "../../shared";
import { shuffleArray } from "./shuffleArray";
import { nextRuneId } from "./nextRuneId";
import { removeFirstMatching } from "./livePouchBanish";

export interface RuneInstanceData {
    id: string;
    element: string;
    rarity: string;
    level: number;
}

/**
 * Build a fresh pouch for the start of a round.
 *
 * Base pool: 13 elements × 4 common runes = 52.
 * Plus any permanent additions the player has earned from Rune Pack picks
 * this run — these carry their original element/rarity/level but get a
 * fresh id on every round build so the pouch/hand diff (keyed on id) in
 * the client sync can't collide with a stale round's runes.
 * Minus any permanently banished runes (Banish sigil) — each entry in
 * `banished` removes one matching (element, rarity, level) rune from the
 * built pool before the shuffle. Banished entries that no longer match
 * anything in the pool (e.g. mutated acquired list) silently no-op so a
 * stale banish can never crash the round-start.
 */
export function createPouch(
    acquired: RuneInstanceData[] = [],
    banished: RuneInstanceData[] = [],
): RuneInstanceData[] {
    const pouch: RuneInstanceData[] = [];

    for (const element of ELEMENT_TYPES) {
        for (let i = 0; i < RUNES_PER_ELEMENT; i++) {
            pouch.push({
                id: nextRuneId(),
                element,
                rarity: "common",
                level: 1,
            });
        }
    }

    for (const r of acquired) {
        pouch.push({
            id: nextRuneId(),
            element: r.element,
            rarity: r.rarity,
            level: r.level,
        });
    }

    for (const b of banished) {
        removeFirstMatching(pouch, b);
    }

    return shuffleArray(pouch);
}
