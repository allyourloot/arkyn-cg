import { type ArkynState, ShopItemState } from "../../shared";
import { PACK_DEFINITIONS } from "../../shared/packs";
import { generateShopPacks, generateShopSigils } from "../../shared/shopGeneration";
import { SIGIL_DEFINITIONS } from "../../shared/sigils";
import { Logger } from "@core/shared/utils";
import { initPlayerForRound } from "../utils/initPlayerForRound";
import { createPouch } from "../utils/createPouch";
import { setPouch } from "../resources/playerPouch";
import { syncPlayerPouch } from "../utils/drawRunes";
import { clearArraySchema } from "../utils/clearArraySchema";
import { spawnEnemy, applyBossDebuff } from "./handleJoin";

const logger = new Logger("ArkynReady");

/**
 * ARKYN_READY is the single client message that drives both inter-round
 * transitions:
 *
 *   round_end  →  shop     (Continue on the Round Win overlay)
 *   shop       →  playing  (Continue on the Shop screen)
 *
 * Entering the shop is a no-op on the player state — we only flip the
 * phase so the client swaps to the shop layout. Leaving the shop does the
 * real per-round work (round++, reset budgets, fresh pouch/hand, spawn the
 * next enemy).
 */
export function handleReady(
    state: ArkynState,
    client: { sessionId: string },
): void {
    const player = state.players.get(client.sessionId);
    if (!player) {
        logger.warn(`Ready rejected: player ${client.sessionId} not found`);
        return;
    }

    if (player.gamePhase === "round_end") {
        // NOTE: the round-win gold itself is credited via
        // `handleCollectRoundGold` fired at the moment the RoundEnd
        // overlay's "Total" line reveals — not here. By the time the
        // player hits Continue the gold is already in their bank.

        // Rebuild the pouch for the shop so the PouchCounter and
        // PouchModal show the player's FULL deck composition, not the
        // leftover from the just-finished round. `initPlayerForRound`
        // will run again on shop → playing to build a fresh seeded
        // pouch for the actual round; this rebuild is purely for the
        // shop-phase UI state. Also clears the hand so the modal doesn't
        // display any stale "drawn" slots during the shop visit — every
        // owned rune is visually in the pouch column while the player browses.
        clearArraySchema(player.hand);
        const acquired = Array.from(player.acquiredRunes).map(r => ({
            id: r.id,
            element: r.element,
            rarity: r.rarity,
            level: r.level,
        }));
        const banished = Array.from(player.banishedRunes).map(r => ({
            id: r.id,
            element: r.element,
            rarity: r.rarity,
            level: r.level,
        }));
        const shopPouch = createPouch(acquired, banished);
        setPouch(client.sessionId, shopPouch);
        syncPlayerPouch(player, shopPouch);
        player.pouchSize = shopPouch.length;

        // Pre-spawn the next enemy so the shop panel can show boss/debuff
        // info as part of the "Next Enemy" preview. The round counter
        // hasn't incremented yet, so pass currentRound + 1 explicitly.
        spawnEnemy(player, player.currentRound + 1, player.runSeed);

        // Generate seeded shop inventory for this visit. Both the pack
        // slots and the sigil slots are deterministic given the run seed
        // + round, so replaying the same seed yields the same shop
        // offerings.
        const nextRound = player.currentRound + 1;
        const packIds = generateShopPacks(player.runSeed, nextRound);
        const ownedSigils = Array.from(player.sigils);
        const sigilIds = generateShopSigils(player.runSeed, nextRound, ownedSigils);
        clearArraySchema(player.shopItems);
        // Fresh shop visit -> reset per-visit pack purchase counters so
        // the caps enforce MAX_*_PER_SHOP per shop (not per run).
        player.packPurchaseCount = 0;
        player.codexPurchaseCount = 0;
        player.auguryPurchaseCount = 0;
        // Fresh shop visit -> reset reroll counter. The initial sigil roll
        // below uses rerollCount=0; the client's Reroll button increments
        // this and re-generates the sigil slots via handleRerollShop.
        player.shopRerollCount = 0;

        // Sigil items first ("Items" section in the shop UI).
        for (const sigilId of sigilIds) {
            const def = SIGIL_DEFINITIONS[sigilId];
            if (!def) continue;
            const item = new ShopItemState();
            item.itemType = "sigil";
            item.element = sigilId; // polymorphic: sigil ID for sigils
            item.cost = def.cost;
            item.purchased = false;
            player.shopItems.push(item);
        }

        // Pack items ("Packs" section). Each generated pack id keys
        // directly into PACK_DEFINITIONS for cost + purchase handler.
        for (const packId of packIds) {
            const def = PACK_DEFINITIONS[packId];
            if (!def) continue;
            const item = new ShopItemState();
            item.itemType = def.itemType;
            item.element = "";
            item.cost = def.cost;
            item.purchased = false;
            player.shopItems.push(item);
        }

        player.gamePhase = "shop";
        const bossTag = player.enemy.isBoss ? ` [BOSS - ${player.enemy.debuff}]` : "";
        logger.info(`Player ${client.sessionId} entered shop. Sigils: [${sigilIds.join(", ")}], Packs: [${packIds.join(", ")}]. Next enemy: ${player.enemy.name} (HP: ${player.enemy.maxHp})${bossTag}`);
        return;
    }

    if (player.gamePhase === "shop") {
        player.currentRound++;
        // Enemy already spawned on shop entry — just init the player
        // and apply any boss debuff modifiers. Pass enemy affinities so
        // lifecycle hooks like Binoculars can pick a target at round start.
        initPlayerForRound(player, client.sessionId, player.currentRound, player.runSeed, {
            enemyResistances: Array.from(player.enemy.resistances),
            enemyWeaknesses: Array.from(player.enemy.weaknesses),
        });
        applyBossDebuff(player);
        player.gamePhase = "playing";
        logger.info(`Round ${player.currentRound} started. Enemy: ${player.enemy.name} (HP: ${player.enemy.maxHp})`);
        return;
    }

    logger.warn(`Ready rejected: game phase is ${player.gamePhase}`);
}
