import {
    AUGURY_PACK_RUNE_CHOICES,
    AUGURY_PACK_TAROT_CHOICES,
    TAROT_IDS,
    createRoundRng,
    getAuguryRollSeed,
    sampleWithoutReplacement,
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
 * the buy (0 for the first pack of the shop visit). The seed builder
 * (`getAuguryRollSeed`) multiplies it by a prime so a 2nd pack in the
 * same shop yields a different picker.
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
    const rng = createRoundRng(runSeed, getAuguryRollSeed(round, packIndex));

    // Sample runes from livePouch by index, without replacement. Each
    // sample gets a fresh id so the picker rune is distinct from the
    // live-pouch entry (Colyseus enforces single-parent on schema
    // children, and the picker copies sit in a separate ArraySchema).
    const sampledRunes = sampleWithoutReplacement(livePouch, AUGURY_PACK_RUNE_CHOICES, rng);
    const runes: RuneInstanceData[] = sampledRunes.map(r => ({
        id: nextRuneId(),
        element: r.element,
        rarity: r.rarity,
        level: r.level,
    }));

    const tarotIds = sampleWithoutReplacement(TAROT_IDS, AUGURY_PACK_TAROT_CHOICES, rng);

    return { runes, tarotIds: [...tarotIds] };
}
