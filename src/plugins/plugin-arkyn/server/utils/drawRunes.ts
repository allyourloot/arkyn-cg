import { RuneInstance, isRarity, type ArkynPlayerState } from "../../shared";
import { clearArraySchema } from "./clearArraySchema";
import type { RuneInstanceData } from "./createPouch";

/**
 * Build a Schema-backed RuneInstance from plain pouch data. Validates the
 * rarity at the factory boundary so the invariant "every RuneInstance in
 * the game has a canonical rarity" holds everywhere downstream — the
 * `as RarityType` casts in the damage pipeline are safe-by-construction.
 */
export function createRuneInstance(data: RuneInstanceData): RuneInstance {
    if (!isRarity(data.rarity)) {
        throw new Error(
            `createRuneInstance: invalid rarity "${data.rarity}" for rune ${data.id} ` +
            `(${data.element}). Rarity must be one of the canonical RARITY_TYPES.`,
        );
    }
    const rune = new RuneInstance();
    rune.id = data.id;
    rune.element = data.element;
    rune.rarity = data.rarity;
    rune.level = data.level;
    return rune;
}

/** Draw N runes from the pouch, returning RuneInstance Schema objects */
export function drawRunes(pouch: RuneInstanceData[], count: number): RuneInstance[] {
    const drawn: RuneInstance[] = [];
    const toDraw = Math.min(count, pouch.length);

    for (let i = 0; i < toDraw; i++) {
        drawn.push(createRuneInstance(pouch.pop()!));
    }

    return drawn;
}

/**
 * Rebuild `player.pouch` from the resource pouch so the client schema mirrors
 * the server's authoritative undrawn-rune list. Called whenever the resource
 * pouch is mutated (initial create, draw, etc.).
 */
export function syncPlayerPouch(player: ArkynPlayerState, pouch: RuneInstanceData[]): void {
    clearArraySchema(player.pouch);
    for (const data of pouch) {
        player.pouch.push(createRuneInstance(data));
    }
}
