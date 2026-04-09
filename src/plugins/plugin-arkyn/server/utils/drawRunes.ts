import { RuneInstance, type ArkynPlayerState } from "../../shared";
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

/**
 * Rebuild `player.pouch` from the resource pouch so the client schema mirrors
 * the server's authoritative undrawn-rune list. Called whenever the resource
 * pouch is mutated (initial create, draw, etc.).
 */
export function syncPlayerPouch(player: ArkynPlayerState, pouch: RuneInstanceData[]): void {
    while (player.pouch.length > 0) player.pouch.pop();
    for (const data of pouch) {
        const rune = new RuneInstance();
        rune.id = data.id;
        rune.element = data.element;
        rune.rarity = data.rarity;
        rune.level = data.level;
        player.pouch.push(rune);
    }
}
