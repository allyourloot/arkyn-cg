/**
 * Seeded enemy generation. Each run gets a seed; combining it with the
 * round number deterministically picks an enemy from the bank. HP is
 * fixed per round (difficulty curve), not per enemy.
 *
 * Two runs with the same seed face the same enemies in the same order.
 *
 * Damage model recap (`shared/calculateDamage.ts`):
 *     baseTotal   = SPELL_TIER_BASE_DAMAGE[tier] + Σ runeBase × elementalMod
 *     finalDamage = baseTotal × SPELL_TIER_MULT[tier]
 *     elementalMod = 0.5 (resist) / 1.0 (neutral) / 1.5 (weak)
 *
 * Reference damage outputs (common rune base = 8):
 *   T1 = 12 neutral / 20 weak     T2 = 48 / 80
 *   T3 = 108 / 180                T4 = 192 / 320
 *   T5 = 300 / 500
 * Player has 3 casts per round with 8 runes in hand.
 */

import { ENEMY_BANK, type EnemyTemplate } from "./enemyBank";
import { createRoundRng } from "./seededRandom";

export interface EnemyDefinition {
    name: string;
    hp: number;
    element: string;
    resistances: string[];
    weaknesses: string[];
}

/**
 * Static HP curve by round. Tuned for the Base + Mult damage model.
 * Past the end of this table the last value scales by 30% per extra round.
 *
 * The curve has three phases tuned to the player's learning trajectory:
 *
 *   Rounds 1-5 — LEARNING (easy → medium). Values close to the original
 *   pre-rebalance curve. A new player without any sigils can kill each
 *   round in 2-3 casts by discarding into matching elements. Round 5 is
 *   the first boss and introduces real strategy (picking elements to
 *   match enemy weakness, budgeting casts) but stays reachable.
 *
 *   Rounds 6-8 — RAMP (medium → hard). HP climbs faster than player
 *   damage would from runes alone, so the player feels the pull to buy
 *   sigils / scrolls / rune bags from the shop. A full-stack T5 cast
 *   starts becoming necessary rather than optional.
 *
 *   Rounds 9+ — CATCHUP (1.3x/round exponential). Keeps pace with the
 *   player's late-game damage ceiling (~80-110K from a good sigil
 *   stack), so rounds 15-25 resolve in 1-2 big casts with meaningful
 *   margin rather than one-shot overkill.
 */
const HP_CURVE: readonly number[] = [
    60,   // round 1  — warm-up
    100,  // round 2  — learning
    170,  // round 3  — learning
    300,  // round 4  — learning
    475,  // round 5  — boss (first strategic gate)
    725,  // round 6  — ramp
    1100, // round 7  — ramp
    1600, // round 8  — ramp (feeds exponential tail)
];

/** Get the HP value for a given round number. */
export function getHpForRound(round: number): number {
    const r = Math.max(1, round);
    if (r <= HP_CURVE.length) {
        return HP_CURVE[r - 1];
    }
    const last = HP_CURVE[HP_CURVE.length - 1];
    const extra = r - HP_CURVE.length;
    return Math.round(last * Math.pow(1.3, extra));
}

/**
 * Deterministically pick an enemy for a round using the run seed.
 * The same seed + round always produces the same enemy. Consecutive
 * rounds avoid picking the same enemy template back-to-back.
 */
export function getEnemyForRound(round: number, seed: number): EnemyDefinition {
    const rng = createRoundRng(seed, round);
    const hp = getHpForRound(round);

    // Pick from the bank. To avoid back-to-back duplicates, also compute
    // what the previous round picked and re-roll once if they collide.
    let idx = Math.floor(rng() * ENEMY_BANK.length);
    if (round > 1) {
        const prevRng = createRoundRng(seed, round - 1);
        const prevIdx = Math.floor(prevRng() * ENEMY_BANK.length);
        if (idx === prevIdx) {
            idx = (idx + 1 + Math.floor(rng() * (ENEMY_BANK.length - 1))) % ENEMY_BANK.length;
        }
    }

    const template: EnemyTemplate = ENEMY_BANK[idx];
    return {
        name: template.name,
        hp,
        element: template.element,
        resistances: [...template.resistances],
        weaknesses: [...template.weaknesses],
    };
}
