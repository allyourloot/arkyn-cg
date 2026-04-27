/**
 * RNG namespace registry — the single source of truth for every per-roll
 * seed offset used in this plugin.
 *
 * Determinism across server + client requires each independent RNG stream
 * to live in its OWN namespace so rolls don't correlate. Historically these
 * offsets were defined in 5+ different files (rollPackRunes.ts,
 * rollCodexScrolls.ts, shopGeneration.ts, sigilEffects.ts, tarots.ts) with
 * a comment block in each one cataloguing the others; the registry was a
 * latent bug surface every time a new roll was added. This file
 * consolidates the entire map so adding/auditing namespaces is a one-file
 * read.
 *
 * ## Namespace map (global)
 *
 *   [      0]            Enemy selection           (enemyDefinitions)
 *   [  50000]            Boss debuff roll          (bossDebuffs)
 *   [ 100000]            Shop scroll generation    (shopGeneration)
 *   [ 200000]            Shop sigil generation     (shopGeneration)
 *   [ 300000–399999]     SIGIL_PROCS               (sigilEffects)
 *   [ 400000–499999]     SIGIL_LIFECYCLE_HOOKS     (sigilEffects)
 *                          slot 0 = Thief, slot 1 = Binoculars, slot 2 = Ahoy
 *   [ 400000 + round + packIndex*7919]
 *                        Rune Pack rolls           (rollPackRunes)
 *                          ⚠ shares the lifecycle base; the streams don't
 *                          interact today because Thief's read is
 *                          `400000 + round` (slot 0 only) while Rune Pack's
 *                          read is `400000 + round + packIndex*7919`. The
 *                          packIndex jitter steps clear of the lifecycle
 *                          band as long as packIndex >= 1 for any OTHER
 *                          lifecycle sigil in slot 1+. Adding a new
 *                          lifecycle sigil here MUST pick a slot > 0
 *                          (so its stream is 410000+round, 420000+round,
 *                          …) or the first pack of a given round will
 *                          correlate with its roll.
 *   [ 500000]            Shop pack-slot generation (shopGeneration)
 *   [ 500000–599999]     SIGIL_CAST_RNG_MULT       (sigilEffects)
 *                          slot 0 = Boom Bomb
 *                          ⚠ shares the shop pack-slot base. The streams
 *                          don't interact today because shop pack-slot
 *                          reads `500000 + round` (round-only seed) while
 *                          cast-rng-mult reads `500000 + round*10 +
 *                          castNumber` (round+cast jitter). New
 *                          cast-rng-mult sigils MUST use slot ≥ 1 to stay
 *                          out of the shop pack-slot band.
 *   [ 600000 + round + packIndex*7919]
 *                        Codex Pack rolls          (rollCodexScrolls)
 *   [ 700000 + round + packIndex*7919]
 *                        Augury Pack picker rolls  (rollAuguryPack via
 *                          getAuguryRollSeed)
 *   [ 700000 + round + packIndex*7919 + 1]
 *                        Augury Pack apply RNG     (handleApplyTarot,
 *                          AuguryPicker via getAuguryApplySeed)
 *
 * ## Adding a new namespace
 *
 *  - Sigil in an existing category → use the relevant slot helper
 *    (`procRngSlot`, `lifecycleRngSlot`, `castRngMultRngSlot`) and pick
 *    the next unused slot for that category.
 *  - New roll-type that doesn't fit a category → add a constant here in
 *    the next free 10k step, document its seed-composition formula in
 *    the namespace map above, and import it at the call site instead
 *    of inlining a magic number.
 *  - Module-load validation in `sigilEffects.ts` enforces band-alignment
 *    for the slot-helper-driven categories. Standalone offsets in this
 *    file are not validated — keep their seed formulas obvious enough
 *    that a code review catches collisions.
 */

/**
 * Width of one slot inside a sigil category band — slots are spaced this
 * far apart so a slot's `(rng() * N)` reads don't bleed into the next
 * slot's offset.
 */
export const SIGIL_RNG_OFFSET_SPACING = 10000;

/**
 * Single source of truth for every band-base offset in the plugin.
 * Each entry corresponds to a row in the namespace map above.
 */
export const RNG_NAMESPACES = {
    /** Enemy selection (round → enemy mapping). */
    enemy: 0,
    /** Boss debuff roll. */
    bossDebuff: 50000,
    /** Shop scroll generation. */
    shopScrolls: 100000,
    /** Shop sigil generation (offset by reroll stride for re-rolls). */
    shopSigils: 200000,
    /** SIGIL_PROCS band — slot helper: `procRngSlot(n)`. */
    procBand: 300000,
    /** SIGIL_LIFECYCLE_HOOKS band — slot helper: `lifecycleRngSlot(n)`. */
    lifecycleBand: 400000,
    /**
     * Rune Pack rolls. Shares numeric base with `lifecycleBand` (see ⚠ note
     * in the namespace map). Seed formula: `base + round + packIndex*7919`.
     */
    runePack: 400000,
    /** Shop pack-slot generation. Seed formula: `base + round`. */
    shopPackSlot: 500000,
    /**
     * SIGIL_CAST_RNG_MULT band — slot helper: `castRngMultRngSlot(n)`.
     * Shares numeric base with `shopPackSlot` (see ⚠ note in the
     * namespace map).
     */
    castRngMultBand: 500000,
    /** Codex Pack rolls. Seed formula: `base + round + packIndex*7919`. */
    codexPack: 600000,
    /**
     * Augury Pack rolls (picker AND apply — apply seed is roll seed + 1).
     * Seed formula: `base + round + packIndex*7919`.
     */
    auguryPack: 700000,
} as const;

// ---------------------------------------------------------------------------
// Slot helpers — append-only across runs.
// ---------------------------------------------------------------------------
//
// Each sigil category band reserves slots in 10k increments. Sigil entries
// in their respective registries call these helpers with their slot number
// (0, 1, 2, …) instead of writing the raw offset. Reusing or reordering
// existing slots breaks replay determinism for saved runs — append only.

function rngSlot(base: number, slot: number): number {
    return base + slot * SIGIL_RNG_OFFSET_SPACING;
}

/**
 * Compute the RNG offset for a SIGIL_PROCS slot. Slot 0 = Voltage,
 * 1 = Fortune, 2 = Hourglass, 3 = Chainlink, 4 = Blackjack, 5 = Keychain.
 */
export function procRngSlot(slot: number): number {
    return rngSlot(RNG_NAMESPACES.procBand, slot);
}

/**
 * Compute the RNG offset for a SIGIL_LIFECYCLE_HOOKS slot. Slot 0 = Thief
 * (collides with Rune Pack's base — see ⚠ above; new lifecycle sigils
 * MUST use slot ≥ 1). Slot 1 = Binoculars, slot 2 = Ahoy.
 */
export function lifecycleRngSlot(slot: number): number {
    return rngSlot(RNG_NAMESPACES.lifecycleBand, slot);
}

/**
 * Compute the RNG offset for a SIGIL_CAST_RNG_MULT slot. Slot 0 = Boom Bomb
 * (collides with Shop Pack-slot base — see ⚠ above; new cast-rng-mult
 * sigils MUST use slot ≥ 1).
 */
export function castRngMultRngSlot(slot: number): number {
    return rngSlot(RNG_NAMESPACES.castRngMultBand, slot);
}

// ---------------------------------------------------------------------------
// Backwards-compatible band-base re-exports.
// ---------------------------------------------------------------------------
// Used by the module-load validation in `sigilEffects.ts` (validateRngBand)
// and by readers that prefer the explicit constant name to indexing into
// RNG_NAMESPACES.

export const PROC_RNG_OFFSET_BASE = RNG_NAMESPACES.procBand;
export const LIFECYCLE_RNG_OFFSET_BASE = RNG_NAMESPACES.lifecycleBand;
export const CAST_RNG_MULT_RNG_OFFSET_BASE = RNG_NAMESPACES.castRngMultBand;
