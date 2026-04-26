import {
    CODEX_PACK_CHOICES,
    ELEMENT_TYPES,
    createRoundRng,
} from "../../shared";

// RNG namespace. Must differ from enemy selection (0), boss debuff (50000),
// shop sigils (200000), voltage proc (300000), Rune Pack rolls (400000),
// and shop pack-slot generation (500000).
const CODEX_PACK_RNG_OFFSET = 600000;

/**
 * Roll the 4 scroll-element choices the picker shows after a player buys
 * a Codex Pack. Seeded so a given (runSeed, round, packIndex) triple
 * always rolls the same 4 elements — replaying the same seed reproduces
 * the same packs.
 *
 * `packIndex` is the player's `codexPurchaseCount` at the moment of the
 * buy (0 for the first pack of the shop visit). Multiplied by a prime so
 * a hypothetical 2nd pack in the same shop yields a different set.
 *
 * Picks are sampled WITHOUT replacement — the 4 scrolls are always 4
 * distinct elements, matching the curated-pack feel.
 */
export function rollCodexScrolls(
    runSeed: number,
    round: number,
    packIndex: number,
): string[] {
    const rng = createRoundRng(
        runSeed,
        round + CODEX_PACK_RNG_OFFSET + packIndex * 7919,
    );
    const pool = [...ELEMENT_TYPES] as string[];
    const picks: string[] = [];
    for (let i = 0; i < CODEX_PACK_CHOICES; i++) {
        const idx = Math.floor(rng() * pool.length);
        picks.push(pool[idx]);
        pool.splice(idx, 1);
    }
    return picks;
}
