/**
 * Boss debuff definitions. Every 5th round is a boss round — the enemy
 * gains a single debuff that hampers the player for that fight. The
 * debuff is chosen deterministically from the run seed so replaying
 * the same seed always produces the same boss debuff sequence.
 */

import { createRoundRng } from "./seededRandom";

export interface BossDebuff {
    id: string;
    name: string;
    description: string;
}

export const BOSS_DEBUFFS: readonly BossDebuff[] = [
    {
        id: "reduced_hand",
        name: "Reduced Hand",
        description: "-1 Hand Size",
    },
    {
        id: "fortified",
        name: "Fortified",
        description: "+50% HP",
    },
    {
        id: "exhausting",
        name: "Exhausting",
        description: "-1 Cast",
    },
    {
        id: "unyielding",
        name: "Unyielding",
        description: "-1 Discard",
    },
];

/** Boss rounds occur every 5th round (5, 10, 15, …). */
export function isBossRound(round: number): boolean {
    return round > 0 && round % 5 === 0;
}

/**
 * Deterministically pick a debuff for a boss round using the run seed.
 * Uses a separate RNG namespace (round + 50000) to avoid correlation
 * with the enemy pick for the same round.
 */
export function pickDebuffForRound(round: number, seed: number): BossDebuff {
    const rng = createRoundRng(seed, round + 50000);
    return BOSS_DEBUFFS[Math.floor(rng() * BOSS_DEBUFFS.length)];
}

/** Look up display info for a debuff ID. Returns undefined for non-boss enemies. */
export function getDebuffById(debuffId: string): BossDebuff | undefined {
    return BOSS_DEBUFFS.find(d => d.id === debuffId);
}
