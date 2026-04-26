/**
 * Deterministic uniform sample of N items from a pool, without
 * replacement. Output count is `min(count, pool.length)` so passing a
 * count larger than the pool silently clamps instead of erroring.
 *
 * Replaces the two near-identical sampling loops in `rollAuguryPack`
 * (one for the 8 picker runes, one for the 5 tarot ids) with a single
 * implementation. Available for any other deterministic-roll site that
 * needs without-replacement sampling.
 */
export function sampleWithoutReplacement<T>(
    pool: readonly T[],
    count: number,
    rng: () => number,
): T[] {
    const remaining = [...pool];
    const out: T[] = [];
    const n = Math.min(count, remaining.length);
    for (let i = 0; i < n; i++) {
        const idx = Math.floor(rng() * remaining.length);
        out.push(remaining[idx]);
        remaining.splice(idx, 1);
    }
    return out;
}
