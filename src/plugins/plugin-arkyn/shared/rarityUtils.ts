import { RARITY_TYPES, type RarityType } from "./arkynConstants";

/**
 * Convert a rarity string to its index in RARITY_TYPES. Unknown values
 * fall through to 0 (common) so callers never have to guard against
 * NaN / -1 propagation through the rarity arithmetic.
 */
export function rarityIndex(r: string): number {
    const idx = (RARITY_TYPES as readonly string[]).indexOf(r);
    return idx < 0 ? 0 : idx;
}

/**
 * Clamp an integer rarity index into the valid RARITY_TYPES range and
 * return the canonical RarityType. Used at every site that produces a
 * rarity by arithmetic (bumps, fuses, max-of-pair) to keep
 * `as RarityType` casts safe-by-construction.
 */
export function clampRarityIndex(idx: number): RarityType {
    const max = RARITY_TYPES.length - 1;
    const clamped = Math.max(0, Math.min(max, idx));
    return RARITY_TYPES[clamped];
}

/**
 * Bump a rarity by N tiers (positive or negative), clamped to the
 * canonical range. Single source of truth used by the tarot effect
 * registry on both server (mutation) and client (preview) so the two
 * sides cannot drift on what "+1 rarity" means.
 */
export function bumpRarity(current: string, tiersUp: number): RarityType {
    return clampRarityIndex(rarityIndex(current) + tiersUp);
}
