import { AUGURY_PACK_RNG_OFFSET } from "./tarots";

/**
 * Multiplier on `packIndex` so two Augury Packs in the same shop visit
 * roll different pickers. A largish prime spreads consecutive packs
 * cleanly across the seed space; the exact value is arbitrary as long
 * as server roll (rollAuguryPack) and apply RNG (handleApplyTarot's
 * Wheel of Fortune / The World branches) and client preview
 * (AuguryPicker) all use the SAME constant.
 */
const AUGURY_PACK_INDEX_PRIME = 7919;

/**
 * Picker-roll seed — what the server feeds `createRoundRng` when sampling
 * the 8 picker runes + 5 tarot ids in `rollAuguryPack`. Combined with
 * `runSeed`, the same `(round, packIndex)` triple always produces the
 * same picker, so reconnect-mid-pack reproduces the offer exactly.
 */
export function getAuguryRollSeed(round: number, packIndex: number): number {
    return round + AUGURY_PACK_RNG_OFFSET + packIndex * AUGURY_PACK_INDEX_PRIME;
}

/**
 * Apply-time seed — the `+1` bump off the picker-roll seed used by
 * Wheel of Fortune (per-rune split RNG) and The World (random rune
 * spawn). The bump prevents apply-time RNG from colliding with the
 * picker-roll RNG, so a pack that rolls element X for one of its picker
 * runes can still roll element X again for its World spawn.
 *
 * Server (handleApplyTarot.computeMutations) and client
 * (AuguryPicker.computePreview) BOTH call this to seed the apply RNG
 * — this is the single source of truth for the formula.
 */
export function getAuguryApplySeed(round: number, packIndex: number): number {
    return getAuguryRollSeed(round, packIndex) + 1;
}
