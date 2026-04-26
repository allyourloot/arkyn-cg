import type { RuneInstanceData } from "./createPouch";

/**
 * Match key used to compare a banish entry against the live pouch.
 * The id field is intentionally NOT part of the match — pouch ids are
 * minted fresh every round (createPouch rebuilds with `nextRuneId()` on
 * each call) so a banish from a prior round must match by composition,
 * not identity. Element + rarity + level uniquely identify a rune's
 * gameplay role and is the canonical match key for banish + acquired
 * tracking across the codebase.
 */
type BanishKey = Pick<RuneInstanceData, "element" | "rarity" | "level">;

/**
 * Remove the first pouch entry that matches `key` by element + rarity +
 * level. Returns true if a match was spliced out, false if no match
 * existed. Mutates `pouch` in place.
 *
 * Replaces a duplicated `findIndex` + `splice` pattern in
 * `handleApplyTarot.ts` (banishing tarot picks) and `createPouch.ts`
 * (subtracting prior-run banishes when the round-start pouch is built).
 */
export function removeFirstMatching(
    pouch: RuneInstanceData[],
    key: BanishKey,
): boolean {
    const idx = pouch.findIndex(
        r => r.element === key.element && r.rarity === key.rarity && r.level === key.level,
    );
    if (idx < 0) return false;
    pouch.splice(idx, 1);
    return true;
}
