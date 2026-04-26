import {
    ELEMENT_TYPES,
    RUNE_PACK_CHOICES,
    RUNE_PACK_RARITY_WEIGHTS,
    createRoundRng,
    type RarityType,
} from "../../shared";
import { nextRuneId } from "./nextRuneId";
import type { RuneInstanceData } from "./createPouch";

// RNG namespace. Must differ from enemy selection (0), boss debuff (50000),
// shop scrolls (100000), shop sigils (200000), and voltage proc (300000).
const RUNE_PACK_RNG_OFFSET = 400000;

/**
 * Roll the 4 rune choices the picker shows after a player buys a Rune
 * Pack. Seeded so a given (runSeed, round, packIndex) triple always
 * rolls the same 4 runes — replaying the same seed reproduces the same
 * packs.
 *
 * `packIndex` is the player's `packPurchaseCount` at the moment of the
 * buy (0 for the first pack of the shop visit). Multiplied by a prime
 * so buying a 2nd pack in the same shop yields a completely different
 * set.
 *
 * Per-slot rolls are independent — duplicate elements within one pack
 * are possible (matches the "fully random" spec).
 */
export function rollPackRunes(
    runSeed: number,
    round: number,
    packIndex: number,
): RuneInstanceData[] {
    const rng = createRoundRng(runSeed, round + RUNE_PACK_RNG_OFFSET + packIndex * 7919);

    // Precompute the cumulative rarity table once per roll.
    const rarities = Object.keys(RUNE_PACK_RARITY_WEIGHTS) as RarityType[];
    const totalWeight = rarities.reduce(
        (sum, r) => sum + RUNE_PACK_RARITY_WEIGHTS[r],
        0,
    );

    const rolls: RuneInstanceData[] = [];
    for (let i = 0; i < RUNE_PACK_CHOICES; i++) {
        const element = ELEMENT_TYPES[Math.floor(rng() * ELEMENT_TYPES.length)];

        let pick = rng() * totalWeight;
        let rarity: RarityType = rarities[0];
        for (const r of rarities) {
            pick -= RUNE_PACK_RARITY_WEIGHTS[r];
            if (pick <= 0) {
                rarity = r;
                break;
            }
        }

        rolls.push({
            id: nextRuneId(),
            element,
            rarity,
            level: 1,
        });
    }
    return rolls;
}
