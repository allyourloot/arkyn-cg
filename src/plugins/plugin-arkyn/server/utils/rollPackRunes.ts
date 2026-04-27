import {
    ELEMENT_TYPES,
    RUNE_PACK_CHOICES,
    RUNE_PACK_RARITY_WEIGHTS,
    RNG_NAMESPACES,
    createRoundRng,
    type RarityType,
} from "../../shared";
import { nextRuneId } from "./nextRuneId";
import type { RuneInstanceData } from "./createPouch";

// RNG namespace — see `shared/rngNamespace.ts` for the full map. Rune Pack
// rolls share their numeric base with the SIGIL_LIFECYCLE_HOOKS band; the
// `packIndex * 7919` jitter steps clear of the lifecycle slots that own
// it (Thief at slot 0). The shared file documents the latent collision
// and the constraints on adding new lifecycle sigils here.
const RUNE_PACK_RNG_OFFSET = RNG_NAMESPACES.runePack;

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
