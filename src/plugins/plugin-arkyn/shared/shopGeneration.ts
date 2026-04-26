import {
    RUNE_PACK_RARITY_WEIGHTS,
    SHOP_PACK_COUNT,
    SHOP_SIGIL_COUNT,
    type RarityType,
} from "./arkynConstants";
import { PACK_TYPES, type PackType } from "./packs";
import { createRoundRng } from "./seededRandom";
import { SIGIL_DEFINITIONS, SIGIL_IDS } from "./sigils";

// RNG namespace offsets — must differ from enemy selection (0), boss
// debuff (50000), and voltage proc (300000) to avoid correlation.
const SHOP_SIGIL_RNG_OFFSET = 200000;
// Pack-slot rolls live in their own band, distinct from Rune Pack's roll
// band (400000) so the pack-type pick can't correlate with the rune
// rarities rolled inside the pack.
const SHOP_PACK_RNG_OFFSET = 500000;
// Stride between reroll iterations of the same (seed, round) shop. 1000
// is larger than any realistic `round` count so adjacent rounds' sigil
// rolls can't collide with an earlier round's Nth reroll.
const SHOP_SIGIL_REROLL_STRIDE = 1000;

// Shop sigils roll against the same rarity table as Rune Packs so there's
// one source of truth for how rare "rare" feels in the game. Per-shop-slot
// probability: Common 60%, Uncommon 25%, Rare 12%, Legendary 3%.
const SHOP_SIGIL_RARITY_WEIGHTS = RUNE_PACK_RARITY_WEIGHTS;

/**
 * Deterministically generate the pack types offered in the shop for a
 * given round. Each of the SHOP_PACK_COUNT slots rolls independently and
 * uniformly from PACK_TYPES — duplicates within one shop are allowed
 * (e.g. 2 Rune Packs, or 1 Rune Pack + 1 Codex Pack). Two runs with the
 * same seed see the same pack offerings on the same round.
 */
export function generateShopPacks(seed: number, round: number): PackType[] {
    const rng = createRoundRng(seed, round + SHOP_PACK_RNG_OFFSET);
    const picks: PackType[] = [];
    for (let i = 0; i < SHOP_PACK_COUNT; i++) {
        const idx = Math.floor(rng() * PACK_TYPES.length);
        picks.push(PACK_TYPES[idx]);
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
