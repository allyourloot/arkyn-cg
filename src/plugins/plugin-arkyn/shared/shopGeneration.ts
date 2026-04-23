import {
    ELEMENT_TYPES,
    RUNE_BAG_RARITY_WEIGHTS,
    SHOP_SCROLL_COUNT,
    SHOP_SIGIL_COUNT,
    type RarityType,
} from "./arkynConstants";
import { createRoundRng } from "./seededRandom";
import { SIGIL_DEFINITIONS, SIGIL_IDS } from "./sigils";

// RNG namespace offsets — must differ from enemy selection (0), boss
// debuff (50000), and voltage proc (300000) to avoid correlation.
const SHOP_SCROLL_RNG_OFFSET = 100000;
const SHOP_SIGIL_RNG_OFFSET = 200000;
// Stride between reroll iterations of the same (seed, round) shop. 1000
// is larger than any realistic `round` count so adjacent rounds' sigil
// rolls can't collide with an earlier round's Nth reroll.
const SHOP_SIGIL_REROLL_STRIDE = 1000;

// Shop sigils roll against the same rarity table as Rune Bags so there's
// one source of truth for how rare "rare" feels in the game. Per-shop-slot
// probability: Common 60%, Uncommon 25%, Rare 12%, Legendary 3%.
const SHOP_SIGIL_RARITY_WEIGHTS = RUNE_BAG_RARITY_WEIGHTS;

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
 *
 * Picks are **rarity-weighted** — each candidate is weighted by
 * `SHOP_SIGIL_RARITY_WEIGHTS[def.rarity]` so Legendary sigils are rare and
 * feel earned when they appear. Without weighting, a freshly-run shop
 * with the full SIGIL_IDS pool gave every rarity the same ~1-in-N chance,
 * which let Legendaries land on round 1-3 and trivialize runs.
 *
 * Selection is sampling WITHOUT replacement within a single shop visit
 * (so the same sigil never appears in two slots); for each slot we build
 * a fresh cumulative-weight table over the current pool and roll once.
 */
export function generateShopSigils(
    seed: number,
    round: number,
    ownedSigilIds: readonly string[],
    rerollCount = 0,
): string[] {
    const rng = createRoundRng(
        seed,
        round + SHOP_SIGIL_RNG_OFFSET + rerollCount * SHOP_SIGIL_REROLL_STRIDE,
    );
    const owned = new Set(ownedSigilIds);
    const pool = SIGIL_IDS.filter(id => !owned.has(id));
    const picks: string[] = [];
    const count = Math.min(SHOP_SIGIL_COUNT, pool.length);
    for (let i = 0; i < count; i++) {
        // Recompute weights on every slot — Legendary sigils removed in
        // earlier slots shouldn't inflate later slots' Legendary chance.
        const weights = pool.map(id => {
            const def = SIGIL_DEFINITIONS[id];
            return def ? SHOP_SIGIL_RARITY_WEIGHTS[def.rarity as RarityType] : 0;
        });
        const total = weights.reduce((a, b) => a + b, 0);
        if (total <= 0) break;
        let roll = rng() * total;
        let pickIdx = pool.length - 1;
        for (let j = 0; j < pool.length; j++) {
            roll -= weights[j];
            if (roll <= 0) { pickIdx = j; break; }
        }
        picks.push(pool[pickIdx]);
        pool.splice(pickIdx, 1);
    }
    return picks;
}
