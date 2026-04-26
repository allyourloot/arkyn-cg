import {
    type ArkynState,
    applyTarotMutation,
    createRoundRng,
    getAuguryApplySeed,
    getTarotDefinition,
    isElement,
    snapshotRune,
    type PickedRune,
} from "../../shared";
import { Logger } from "@core/shared/utils";
import { clearArraySchema } from "../utils/clearArraySchema";
import { createRuneInstance, syncPlayerPouch } from "../utils/drawRunes";
import { getPouch } from "../resources/playerPouch";
import { nextRuneId } from "../utils/nextRuneId";
import { removeFirstMatching } from "../utils/livePouchBanish";

const logger = new Logger("ArkynApplyTarot");

interface ApplyPayload {
    tarotId?: string | null;
    runeIndices?: number[];
    element?: string;
}

/**
 * Handle the player's commit on the Augury Pack picker.
 *
 * Payload shape:
 *   { tarotId: string, runeIndices: number[], element?: string }
 *     -> apply that tarot to the picked picker runes
 *   { tarotId: null }
 *     -> skip the pack (no effect, no refund)
 *
 * On success the picker arrays are cleared, which drives the picker →
 * shop slide via the parent's schema-sync.
 *
 * The mutation logic per effect lives in `shared/tarotEffects.ts` —
 * this file owns validation, RNG seeding, and the banish/add commit.
 */
export function handleApplyTarot(
    state: ArkynState,
    client: { sessionId: string },
    payload: unknown,
): void {
    const player = state.players.get(client.sessionId);
    if (!player) return;

    if (player.gamePhase !== "shop") {
        logger.warn(`Tarot apply rejected: game phase is ${player.gamePhase}`);
        return;
    }

    if (
        player.pendingAuguryRunes.length === 0 &&
        player.pendingAuguryTarots.length === 0
    ) {
        logger.warn(`Tarot apply rejected: no pack is open for ${client.sessionId}`);
        return;
    }

    const data = (payload as ApplyPayload) ?? {};
    const tarotId = data.tarotId ?? null;

    // Skip path — clear pack state and return.
    if (tarotId === null) {
        clearArraySchema(player.pendingAuguryRunes);
        clearArraySchema(player.pendingAuguryTarots);
        logger.info(`Player ${client.sessionId} skipped Augury Pack.`);
        return;
    }

    // Validate offered tarot — server is authoritative on which 5
    // tarots the player saw.
    const offered = Array.from(player.pendingAuguryTarots);
    if (!offered.includes(tarotId)) {
        logger.warn(`Tarot apply rejected: ${tarotId} was not offered (had ${offered.join(",")})`);
        return;
    }

    const def = getTarotDefinition(tarotId);
    if (!def) {
        logger.warn(`Tarot apply rejected: unknown tarot ${tarotId}`);
        return;
    }

    // Validate runeIndices length + bounds + uniqueness.
    const runeIndices = Array.isArray(data.runeIndices) ? data.runeIndices : [];
    if (
        runeIndices.length < def.minTargets ||
        runeIndices.length > def.maxTargets
    ) {
        logger.warn(
            `Tarot ${tarotId} apply rejected: ` +
            `picked ${runeIndices.length} runes (need ${def.minTargets}..${def.maxTargets})`,
        );
        return;
    }
    const seen = new Set<number>();
    for (const idx of runeIndices) {
        if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0 || idx >= player.pendingAuguryRunes.length) {
            logger.warn(`Tarot ${tarotId} apply rejected: invalid rune index ${idx}`);
            return;
        }
        if (seen.has(idx)) {
            logger.warn(`Tarot ${tarotId} apply rejected: duplicate rune index ${idx}`);
            return;
        }
        seen.add(idx);
    }

    // Validate element pick.
    if (def.requiresElement) {
        if (!data.element || !isElement(data.element)) {
            logger.warn(`Tarot ${tarotId} apply rejected: missing or invalid element`);
            return;
        }
    }

    // Validate target constraint (currently only Strength).
    if (def.targetConstraint === "commonOrUncommonOnly") {
        for (const idx of runeIndices) {
            const r = player.pendingAuguryRunes[idx];
            if (r.rarity !== "common" && r.rarity !== "uncommon") {
                logger.warn(
                    `Tarot ${tarotId} apply rejected: rune ${idx} is ${r.rarity}, requires common/uncommon`,
                );
                return;
            }
        }
    }

    // Snapshot picked runes BEFORE we mutate any schema arrays.
    const picked: PickedRune[] = runeIndices.map(idx => ({
        rune: snapshotRune(player.pendingAuguryRunes[idx]),
        pickerIndex: idx,
    }));
    const livePouch = getPouch(client.sessionId);
    if (!livePouch) {
        logger.warn(`Tarot ${tarotId} apply rejected: no live pouch for ${client.sessionId}`);
        return;
    }

    // Compute mutations via the shared registry (single source of truth
    // shared with the client preview).
    const rng = createRoundRng(
        player.runSeed,
        getAuguryApplySeed(player.currentRound, player.auguryPurchaseCount),
    );
    const mutations = applyTarotMutation(def.effect, {
        picked,
        chosenElement: data.element ?? "",
        livePouch,
        rng,
        nextId: nextRuneId,
    });

    // Apply: banish entries (push to schema + splice from live pouch)
    // first so subsequent adds don't accidentally re-splice the new
    // mutated copies.
    for (const banish of mutations.banish) {
        player.banishedRunes.push(createRuneInstance(banish));
        removeFirstMatching(livePouch, banish);
    }

    for (const add of mutations.add) {
        // Schema record uses the registry-minted id (nextRuneId), and
        // live-pouch entry mirrors it with a fresh id (matches
        // handleBagChoice — `acquiredRunes` ids are distinct from
        // live-pouch ids, which become stale every round when
        // createPouch rebuilds with fresh ids).
        player.acquiredRunes.push(createRuneInstance(add));
        livePouch.push({
            id: nextRuneId(),
            element: add.element,
            rarity: add.rarity,
            level: add.level,
        });
    }

    if (mutations.goldDelta > 0) {
        player.gold += mutations.goldDelta;
    }

    player.pouchSize = livePouch.length;
    syncPlayerPouch(player, livePouch);

    clearArraySchema(player.pendingAuguryRunes);
    clearArraySchema(player.pendingAuguryTarots);

    logger.info(
        `Player ${client.sessionId} applied tarot ${tarotId}: ` +
        `banished ${mutations.banish.length}, added ${mutations.add.length}, ` +
        `gold +${mutations.goldDelta}. Post-apply state: ` +
        `acquiredRunes=${player.acquiredRunes.length}, banishedRunes=${player.banishedRunes.length}, ` +
        `pouchSize=${player.pouchSize}, livePouch.length=${livePouch.length}.`,
    );
}
