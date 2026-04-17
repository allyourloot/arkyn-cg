import { type ArkynState, ShopItemState } from "../../shared";
import {
    SCROLL_COST,
    RUNE_BAG_COST,
    SHOP_RUNE_BAG_COUNT,
} from "../../shared/arkynConstants";
import { generateShopScrolls, generateShopSigils } from "../../shared/shopGeneration";
import { SIGIL_DEFINITIONS } from "../../shared/sigils";
import { Logger } from "@core/shared/utils";
import { initPlayerForRound } from "../utils/initPlayerForRound";
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

    if (state.gamePhase === "round_end") {
        // NOTE: the round-win gold itself is credited via
        // `handleCollectRoundGold` fired at the moment the RoundEnd
        // overlay's "Total" line reveals — not here. By the time the
        // player hits Continue the gold is already in their bank.

        // Pre-spawn the next enemy so the shop panel can show boss/debuff
        // info as part of the "Next Enemy" preview. The round counter
        // hasn't incremented yet, so pass currentRound + 1 explicitly.
        spawnEnemy(state, state.currentRound + 1);

        // Generate seeded shop inventory for this visit. The scroll
        // elements are deterministic given the run seed + round, so
        // replaying the same seed yields the same shop offerings.
        const nextRound = state.currentRound + 1;
        const scrollElements = generateShopScrolls(state.runSeed, nextRound);
        const ownedSigils = Array.from(player.sigils);
        const sigilIds = generateShopSigils(state.runSeed, nextRound, ownedSigils);
        while (player.shopItems.length > 0) player.shopItems.pop();
        // Fresh shop visit -> reset per-visit bag purchase counter so the
        // cap enforces MAX_RUNE_BAGS_PER_SHOP per shop (not per run).
        player.bagPurchaseCount = 0;

        // Sigil items first (top section in shop UI)
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

        // Scroll items (bottom section)
        for (const element of scrollElements) {
            const item = new ShopItemState();
            item.itemType = "scroll";
            item.element = element;
            item.cost = SCROLL_COST;
            item.purchased = false;
            player.shopItems.push(item);
        }

        // Rune Bag items (share the Consumables section with scrolls on
        // the client). Art is homogeneous so no seeded generator needed.
        for (let i = 0; i < SHOP_RUNE_BAG_COUNT; i++) {
            const item = new ShopItemState();
            item.itemType = "runeBag";
            item.element = "";
            item.cost = RUNE_BAG_COST;
            item.purchased = false;
            player.shopItems.push(item);
        }

        state.gamePhase = "shop";
        const bossTag = state.enemy.isBoss ? ` [BOSS - ${state.enemy.debuff}]` : "";
        logger.info(`Player ${client.sessionId} entered shop. Sigils: [${sigilIds.join(", ")}], Scrolls: [${scrollElements.join(", ")}]. Next enemy: ${state.enemy.name} (HP: ${state.enemy.maxHp})${bossTag}`);
        return;
    }

    if (state.gamePhase === "shop") {
        state.currentRound++;
        // Enemy already spawned on shop entry — just init the player
        // and apply any boss debuff modifiers. Pass enemy affinities so
        // lifecycle hooks like Binoculars can pick a target at round start.
        initPlayerForRound(player, client.sessionId, state.currentRound, state.runSeed, {
            enemyResistances: Array.from(state.enemy.resistances),
            enemyWeaknesses: Array.from(state.enemy.weaknesses),
        });
        applyBossDebuff(state, player);
        state.gamePhase = "playing";
        logger.info(`Round ${state.currentRound} started. Enemy: ${state.enemy.name} (HP: ${state.enemy.maxHp})`);
        return;
    }

    logger.warn(`Ready rejected: game phase is ${state.gamePhase}`);
}
