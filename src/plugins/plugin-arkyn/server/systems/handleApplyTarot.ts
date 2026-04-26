import {
    type ArkynState,
    type RuneInstance,
    ELEMENT_TYPES,
    RARITY_TYPES,
    isElement,
    type RarityType,
    type ElementType,
    getTarotDefinition,
    type TarotEffect,
    createRoundRng,
} from "../../shared";
import { Logger } from "@core/shared/utils";
import { clearArraySchema } from "../utils/clearArraySchema";
import { createRuneInstance, syncPlayerPouch } from "../utils/drawRunes";
import { getPouch } from "../resources/playerPouch";
import { nextRuneId } from "../utils/nextRuneId";
import type { RuneInstanceData } from "../utils/createPouch";
import { AUGURY_PACK_RNG_OFFSET } from "../utils/rollAuguryPack";

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
    const pickedRunes: RuneInstanceData[] = runeIndices.map(idx => snapshotRune(player.pendingAuguryRunes[idx]));
    const livePouch = getPouch(client.sessionId);
    if (!livePouch) {
        logger.warn(`Tarot ${tarotId} apply rejected: no live pouch for ${client.sessionId}`);
        return;
    }

    // Compute mutations from the effect.
    const mutations = computeMutations(
        def.effect,
        pickedRunes,
        data.element ?? "",
        livePouch,
        player.runSeed,
        player.currentRound,
        player.auguryPurchaseCount,
    );

    // Apply: banish entries (push to schema + splice from live pouch)
    // first so subsequent adds don't accidentally re-splice the new
    // mutated copies.
    for (const banish of mutations.banishEntries) {
        player.banishedRunes.push(createRuneInstance(banish));
        const liveIdx = livePouch.findIndex(
            r => r.element === banish.element && r.rarity === banish.rarity && r.level === banish.level,
        );
        if (liveIdx >= 0) livePouch.splice(liveIdx, 1);
    }

    for (const add of mutations.addEntries) {
        // Schema record uses the snapshot id; live-pouch entry gets a
        // fresh id (matches handleBagChoice — `acquiredRunes` ids are
        // distinct from live-pouch ids, which become stale every round
        // when createPouch rebuilds with fresh ids).
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
        `banished ${mutations.banishEntries.length}, added ${mutations.addEntries.length}, ` +
        `gold +${mutations.goldDelta}. Post-apply state: ` +
        `acquiredRunes=${player.acquiredRunes.length}, banishedRunes=${player.banishedRunes.length}, ` +
        `pouchSize=${player.pouchSize}, livePouch.length=${livePouch.length}.`,
    );
}

interface MutationSet {
    banishEntries: RuneInstanceData[];
    addEntries: RuneInstanceData[];
    goldDelta: number;
}

function snapshotRune(r: RuneInstance): RuneInstanceData {
    return { id: r.id, element: r.element, rarity: r.rarity, level: r.level };
}

/**
 * Pure: turn a TarotEffect + selected runes (+ element + live pouch) into
 * the discrete mutations to apply. Called once per Apply; the dispatcher
 * walks the result lists and pushes onto the schema arrays.
 */
function computeMutations(
    effect: TarotEffect,
    picked: RuneInstanceData[],
    chosenElement: string,
    livePouch: readonly RuneInstanceData[],
    runSeed: number,
    round: number,
    packIndex: number,
): MutationSet {
    const banish: RuneInstanceData[] = [];
    const add: RuneInstanceData[] = [];
    let gold = 0;

    switch (effect.type) {
        case "convertElement": {
            for (const r of picked) {
                banish.push(snapshotData(r));
                add.push({ id: nextRuneId(), element: effect.element, rarity: r.rarity, level: r.level });
            }
            break;
        }
        case "duplicate": {
            for (const r of picked) {
                add.push({ id: nextRuneId(), element: r.element, rarity: r.rarity, level: r.level });
            }
            break;
        }
        case "upgradeRarity": {
            for (const r of picked) {
                banish.push(snapshotData(r));
                add.push({
                    id: nextRuneId(),
                    element: r.element,
                    rarity: bumpRarity(r.rarity, effect.tiersUp),
                    level: r.level,
                });
            }
            break;
        }
        case "consecrate": {
            // Hierophant — convert to chosenElement AND bump rarity by 1.
            for (const r of picked) {
                banish.push(snapshotData(r));
                add.push({
                    id: nextRuneId(),
                    element: chosenElement,
                    rarity: bumpRarity(r.rarity, 1),
                    level: r.level,
                });
            }
            break;
        }
        case "fuse": {
            // Lovers — exactly 2 picked, produces 1 of chosen element with max(rarity)+1.
            if (picked.length !== 2) break;
            for (const r of picked) banish.push(snapshotData(r));
            const maxIdx = Math.max(rarityIndex(picked[0].rarity), rarityIndex(picked[1].rarity));
            add.push({
                id: nextRuneId(),
                element: chosenElement,
                rarity: clampRarityIndex(maxIdx + 1),
                level: 1,
            });
            break;
        }
        case "wheelReroll": {
            const rng = createRoundRng(
                runSeed,
                round + AUGURY_PACK_RNG_OFFSET + packIndex * 7919 + 1,
            );
            for (const r of picked) {
                banish.push(snapshotData(r));
                if (rng() < 0.5) {
                    // Upgrade rarity
                    add.push({
                        id: nextRuneId(),
                        element: r.element,
                        rarity: bumpRarity(r.rarity, 1),
                        level: r.level,
                    });
                } else {
                    // Random different element, same rarity
                    const others = ELEMENT_TYPES.filter(e => e !== r.element);
                    const newEl = others[Math.floor(rng() * others.length)];
                    add.push({
                        id: nextRuneId(),
                        element: newEl,
                        rarity: r.rarity,
                        level: r.level,
                    });
                }
            }
            break;
        }
        case "banish": {
            for (const r of picked) banish.push(snapshotData(r));
            break;
        }
        case "banishForGold": {
            for (const r of picked) banish.push(snapshotData(r));
            gold = picked.length * effect.goldPerRune;
            break;
        }
        case "upgradeAllOfElement": {
            // Judgement — operate on the LIVE pouch, not the picker
            // snapshot, so this always reflects current pouch composition.
            for (const r of livePouch) {
                if (r.element !== chosenElement) continue;
                banish.push(snapshotData(r));
                add.push({
                    id: nextRuneId(),
                    element: r.element,
                    rarity: bumpRarity(r.rarity, 1),
                    level: r.level,
                });
            }
            break;
        }
        case "addRandomRune": {
            // World — single Rare or Legendary roll, uniform element.
            const rng = createRoundRng(
                runSeed,
                round + AUGURY_PACK_RNG_OFFSET + packIndex * 7919 + 1,
            );
            const element = ELEMENT_TYPES[Math.floor(rng() * ELEMENT_TYPES.length)];
            const rarity: RarityType = rng() < effect.legendaryChance ? "legendary" : "rare";
            add.push({
                id: nextRuneId(),
                element,
                rarity,
                level: 1,
            });
            break;
        }
    }

    return { banishEntries: banish, addEntries: add, goldDelta: gold };
}

function snapshotData(r: RuneInstanceData): RuneInstanceData {
    return { id: r.id, element: r.element, rarity: r.rarity, level: r.level };
}

function rarityIndex(r: string): number {
    const idx = (RARITY_TYPES as readonly string[]).indexOf(r);
    return idx < 0 ? 0 : idx;
}

function clampRarityIndex(idx: number): RarityType {
    const max = RARITY_TYPES.length - 1;
    const clamped = Math.max(0, Math.min(max, idx));
    return RARITY_TYPES[clamped];
}

function bumpRarity(current: string, tiersUp: number): RarityType {
    return clampRarityIndex(rarityIndex(current) + tiersUp);
}

// Re-export ElementType so the dispatcher's type signature stays internal-only.
export type { ElementType };
