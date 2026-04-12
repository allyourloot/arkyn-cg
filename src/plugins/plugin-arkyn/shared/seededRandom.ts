/**
 * Seeded pseudo-random number generator (mulberry32).
 *
 * Every run gets a seed; combining it with the round number produces a
 * deterministic-but-unique sequence per round. Two runs with the same
 * seed will face the same enemies in the same order.
 */

/** Create a mulberry32 PRNG. Each call returns [0, 1). */
export function seededRandom(seed: number): () => number {
    let s = seed | 0;
    return () => {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Create a PRNG scoped to a specific round within a run.
 * Hashing seed × 2654435761 + round produces a unique starting state
 * per round so round 3 of seed 42 always yields the same sequence
 * regardless of how many times round 1 or 2 were sampled.
 */
export function createRoundRng(runSeed: number, round: number): () => number {
    return seededRandom(Math.imul(runSeed, 2654435761) + round);
}

/** Generate a human-friendly 6-digit seed (100000–999999). */
export function generateRunSeed(): number {
    return 100000 + Math.floor(Math.random() * 900000);
}
