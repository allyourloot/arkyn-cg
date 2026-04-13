import { ELEMENT_TYPES, SHOP_SCROLL_COUNT } from "./arkynConstants";
import { createRoundRng } from "./seededRandom";

// RNG namespace offset — must differ from enemy selection (0) and boss
// debuff (50000) to avoid correlation between the three streams.
const SHOP_RNG_OFFSET = 100000;

/**
 * Deterministically generate the scroll elements offered in the shop for
 * a given round. Two runs with the same seed see the same scroll
 * offerings on the same round.
 *
 * Returns an array of distinct element names (length = SHOP_SCROLL_COUNT).
 */
export function generateShopScrolls(seed: number, round: number): string[] {
    const rng = createRoundRng(seed, round + SHOP_RNG_OFFSET);
    const pool = [...ELEMENT_TYPES];
    const picks: string[] = [];
    for (let i = 0; i < SHOP_SCROLL_COUNT; i++) {
        const idx = Math.floor(rng() * pool.length);
        picks.push(pool[idx]);
        pool.splice(idx, 1); // no duplicates within same shop
    }
    return picks;
}
