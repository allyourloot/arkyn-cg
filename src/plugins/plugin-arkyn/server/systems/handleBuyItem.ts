import { type ArkynState } from "../../shared";
import { MAX_SIGILS } from "../../shared/arkynConstants";
import { Logger } from "@core/shared/utils";
import { SHOP_ITEM_HANDLERS } from "./shopItemHandlers";
import { requirePlayer } from "./utils/requirePlayer";
import type { ArkynContext } from "../types/ArkynContext";
import { evaluateAchievements, syncLifetimeToSchema } from "../utils/evaluateAchievements";
import { getRunStats } from "../resources/runStats";

const logger = new Logger("ArkynBuyItem");

export function handleBuyItem(
    state: ArkynState,
    client: { sessionId: string },
    payload: unknown,
    ctx: ArkynContext,
): void {
    const player = requirePlayer({ state, client, action: "Buy", logger, allowedPhases: ["shop"] });
    if (!player) return;

    const data = payload as { shopIndex?: number };
    const shopIndex = data?.shopIndex;
    if (typeof shopIndex !== "number" || shopIndex < 0 || shopIndex >= player.shopItems.length) {
        logger.warn(`Buy rejected: invalid shop index ${shopIndex}`);
        return;
    }

    const item = player.shopItems[shopIndex];
    if (!item || item.purchased) {
        logger.warn(`Buy rejected: item at index ${shopIndex} already purchased or missing`);
        return;
    }

    if (player.gold < item.cost) {
        logger.warn(`Buy rejected: insufficient gold (${player.gold} < ${item.cost})`);
        return;
    }

    const handler = SHOP_ITEM_HANDLERS[item.itemType];
    if (!handler) {
        logger.warn(`Buy rejected: unknown item type "${item.itemType}"`);
        return;
    }

    // Handlers apply their own type-specific state mutations (or return
    // `ok: false` if a precondition fails). Gold is charged and the item
    // flipped to purchased only after the handler succeeds, so there is
    // no refund path to maintain.
    const result = handler({ state, player, item, sessionId: client.sessionId });
    if (!result.ok) {
        logger.warn(`Buy rejected: ${result.reason}`);
        return;
    }

    player.gold -= item.cost;
    item.purchased = true;
    logger.info(`${result.logMessage} Gold remaining: ${player.gold}`);

    // ── Achievement integration ──────────────────────────────────────
    // Pack opens fire immediately on purchase (not on picker-resolve),
    // because that's the moment the player is committed to the pack and
    // expended their gold. Sigil acquisition fires here too — the
    // shop handler has just pushed the sigil id into player.sigils.
    const saveData = ctx.getSaveData(client.sessionId);
    const runStats = getRunStats(client.sessionId);
    if (item.itemType === "runePack") {
        if (saveData) saveData.lifetime.runePacksOpened++;
        syncLifetimeToSchema(player, ctx, client.sessionId);
        evaluateAchievements(client.sessionId, player, ctx, "pack_opened", {
            pack: { kind: "rune" },
        });
    } else if (item.itemType === "auguryPack") {
        if (saveData) saveData.lifetime.auguryPacksOpened++;
        syncLifetimeToSchema(player, ctx, client.sessionId);
        evaluateAchievements(client.sessionId, player, ctx, "pack_opened", {
            pack: { kind: "augury" },
        });
    } else if (item.itemType === "codexPack") {
        // Codex packs aren't tracked by any current achievement, but
        // wire the trigger anyway so future codex achievements drop in
        // by adding one definition entry.
        evaluateAchievements(client.sessionId, player, ctx, "pack_opened", {
            pack: { kind: "codex" },
        });
    } else if (item.itemType === "sigil") {
        if (runStats) {
            runStats.sigilsAcquiredThisRun++;
            runStats.maxSigilsHeld = Math.max(runStats.maxSigilsHeld, player.sigils.length);
        }
        evaluateAchievements(client.sessionId, player, ctx, "sigil_acquired");
        // Defensive — Full Bar should fire as soon as the 6th sigil lands,
        // even if MAX_SIGILS shifts in the future.
        void MAX_SIGILS;
    }
}
