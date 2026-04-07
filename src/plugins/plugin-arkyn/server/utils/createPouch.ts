import { ELEMENT_TYPES, RUNES_PER_ELEMENT } from "../../shared";
import { shuffleArray } from "./shuffleArray";

export interface RuneInstanceData {
    id: string;
    element: string;
    rarity: string;
    level: number;
}

let runeIdCounter = 0;

export function createPouch(): RuneInstanceData[] {
    const pouch: RuneInstanceData[] = [];

    for (const element of ELEMENT_TYPES) {
        for (let i = 0; i < RUNES_PER_ELEMENT; i++) {
            pouch.push({
                id: `rune-${++runeIdCounter}`,
                element,
                rarity: "common",
                level: 1,
            });
        }
    }

    return shuffleArray(pouch);
}
