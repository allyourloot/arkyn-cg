import { ELEMENT_TYPES, RUNES_PER_ELEMENT } from "../../shared";
import { shuffleArray } from "./shuffleArray";
import { nextRuneId } from "./nextRuneId";

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
 * Plus any permanent additions the player has earned from Rune Bag picks
 * this run — these carry their original element/rarity/level but get a
 * fresh id on every round build so the pouch/hand diff (keyed on id) in
 * the client sync can't collide with a stale round's runes.
 */
export function createPouch(acquired: RuneInstanceData[] = []): RuneInstanceData[] {
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

    return shuffleArray(pouch);
}
