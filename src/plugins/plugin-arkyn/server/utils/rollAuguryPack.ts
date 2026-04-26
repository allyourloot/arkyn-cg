import {
    AUGURY_PACK_RUNE_CHOICES,
    AUGURY_PACK_TAROT_CHOICES,
    AUGURY_PACK_RNG_OFFSET,
    TAROT_IDS,
    createRoundRng,
} from "../../shared";
import { nextRuneId } from "./nextRuneId";
import type { RuneInstanceData } from "./createPouch";

export interface AuguryPackRollResult {
    /** Snapshot of N runes sampled from the live pouch (without replacement). */
    runes: RuneInstanceData[];
    /** N tarot ids sampled from TAROT_IDS without replacement. */
    tarotIds: string[];
}

/**
 * Roll the picker contents the player will see after buying an Augury
 * Pack. Seeded so a given (runSeed, round, packIndex) triple always
 * produces the same picker — replays + reconnect-mid-pack reproduce.
 *
 * `packIndex` is the player's `auguryPurchaseCount` at the moment of
 * the buy (0 for the first pack of the shop visit). Multiplied by a
 * prime so a 2nd pack in the same shop yields a different picker.
 *
 * Sampling is WITHOUT replacement — duplicate runes from the pouch are
 * possible (the same Rune element / rarity can appear across slots),
 * but the picker never shows the SAME pouch instance twice.
 *
 * If the player's pouch has fewer runes than `AUGURY_PACK_RUNE_CHOICES`,
 * the picker shows whatever the pouch has (clamped, never errors).
 */
export function rollAuguryPack(
    runSeed: number,
    round: number,
    packIndex: number,
    livePouch: readonly RuneInstanceData[],
): AuguryPackRollResult {
    const rng = createRoundRng(
        runSeed,
        round + AUGURY_PACK_RNG_OFFSET + packIndex * 7919,
    );

    // Sample runes from livePouch by index, without replacement.
    const runePool = [...livePouch];
    const runeCount = Math.min(AUGURY_PACK_RUNE_CHOICES, runePool.length);
    const runes: RuneInstanceData[] = [];
    for (let i = 0; i < runeCount; i++) {
        const idx = Math.floor(rng() * runePool.length);
        const r = runePool[idx];
        // Fresh id keeps the picker rune distinct from the live pouch
        // entry (same as how Rune Bag picks get a fresh id when added).
        // This matters because the picker's RuneInstance copies sit in
        // a separate ArraySchema and Colyseus enforces single-parent.
        runes.push({
            id: nextRuneId(),
            element: r.element,
            rarity: r.rarity,
            level: r.level,
        });
        runePool.splice(idx, 1);
    }

    // Sample tarot ids without replacement.
    const tarotPool = [...TAROT_IDS];
    const tarotCount = Math.min(AUGURY_PACK_TAROT_CHOICES, tarotPool.length);
    const tarotIds: string[] = [];
    for (let i = 0; i < tarotCount; i++) {
        const idx = Math.floor(rng() * tarotPool.length);
        tarotIds.push(tarotPool[idx]);
        tarotPool.splice(idx, 1);
    }

    return { runes, tarotIds };
}
