import { ELEMENT_TYPES, SHOP_SCROLL_COUNT, SHOP_SIGIL_COUNT } from "./arkynConstants";
import { createRoundRng } from "./seededRandom";
import { SIGIL_IDS } from "./sigils";

// RNG namespace offsets — must differ from enemy selection (0), boss
// debuff (50000), and voltage proc (300000) to avoid correlation.
const SHOP_SCROLL_RNG_OFFSET = 100000;
const SHOP_SIGIL_RNG_OFFSET = 200000;

/**
 * Deterministically generate the scroll elements offered in the shop for
 * a given round. Two runs with the same seed see the same scroll
 * offerings on the same round.
 *
 * Returns an array of distinct element names (length = SHOP_SCROLL_COUNT).
 */
export function generateShopScrolls(seed: number, round: number): string[] {
    const rng = createRoundRng(seed, round + SHOP_SCROLL_RNG_OFFSET);
    const pool = [...ELEMENT_TYPES];
    const picks: string[] = [];
    for (let i = 0; i < SHOP_SCROLL_COUNT; i++) {
        const idx = Math.floor(rng() * pool.length);
        picks.push(pool[idx]);
        pool.splice(idx, 1); // no duplicates within same shop
    }
    return picks;
}

/**
 * Deterministically generate the sigil IDs offered in the shop for a
 * given round. Sigils the player already owns are excluded from the pool
 * so the same sigil never appears twice. Returns up to SHOP_SIGIL_COUNT
 * distinct sigil IDs (fewer if the pool is exhausted).
 */
export function generateShopSigils(
    seed: number,
    round: number,
    ownedSigilIds: readonly string[],
): string[] {
    const rng = createRoundRng(seed, round + SHOP_SIGIL_RNG_OFFSET);
    const owned = new Set(ownedSigilIds);
    const pool = SIGIL_IDS.filter(id => !owned.has(id));
    const picks: string[] = [];
    const count = Math.min(SHOP_SIGIL_COUNT, pool.length);
    for (let i = 0; i < count; i++) {
        const idx = Math.floor(rng() * pool.length);
        picks.push(pool[idx]);
        pool.splice(idx, 1);
    }
    return picks;
}
