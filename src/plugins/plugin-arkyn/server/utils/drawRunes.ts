import { RuneInstance } from "../../shared";
import type { RuneInstanceData } from "./createPouch";

/** Draw N runes from the pouch, returning RuneInstance Schema objects */
export function drawRunes(pouch: RuneInstanceData[], count: number): RuneInstance[] {
    const drawn: RuneInstance[] = [];
    const toDraw = Math.min(count, pouch.length);

    for (let i = 0; i < toDraw; i++) {
        const data = pouch.pop()!;
        const rune = new RuneInstance();
        rune.id = data.id;
        rune.element = data.element;
        rune.rarity = data.rarity;
        rune.level = data.level;
        drawn.push(rune);
    }

    return drawn;
}
