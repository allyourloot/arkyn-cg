import { type ArkynState, getConsumableDefinition, getScrollLevelsPerUse } from "../../shared";
import { Logger } from "@core/shared/utils";
import { getActiveSigils } from "../utils/sigils";
import { requirePlayer } from "./utils/requirePlayer";

const logger = new Logger("ArkynUseConsumable");

export function handleUseConsumable(
    state: ArkynState,
    client: { sessionId: string },
    payload: unknown,
): void {
    const player = requirePlayer({
        state, client, logger,
        action: "Use-consumable",
        allowedPhases: ["playing", "shop"],
    });
    if (!player) return;

    const data = payload as { index?: number };
    const index = data?.index;
    if (typeof index !== "number" || index < 0 || index >= player.consumables.length) {
        logger.warn(`Use-consumable rejected: invalid index ${index}`);
        return;
    }

    const consumableId = player.consumables[index];
    if (!consumableId) {
        logger.warn(`Use-consumable rejected: empty slot at index ${index}`);
        return;
    }

    const def = getConsumableDefinition(consumableId);
    if (!def) {
        logger.warn(`Use-consumable rejected: unknown consumable id "${consumableId}"`);
        return;
    }

    // Dispatch the consumable's effect. New effect types land as new arms
    // here; the rest of the flow (slot removal, logging) is shared.
    let logDetail = "";
    switch (def.effect.type) {
        case "upgradeScroll": {
            const element = def.effect.element;
            const currentLevel = player.scrollLevels.get(element) ?? 0;
            const levelsGained = getScrollLevelsPerUse(getActiveSigils(player));
            const newLevel = currentLevel + levelsGained;
            player.scrollLevels.set(element, newLevel);
            logDetail = `${element} scroll → level ${newLevel}${levelsGained > 1 ? ` (+${levelsGained})` : ""}`;
            break;
        }
    }

    player.consumables.splice(index, 1);

    logger.info(
        `Player ${client.sessionId} used ${def.name}${logDetail ? ` (${logDetail})` : ""}. ` +
        `Consumables remaining: ${player.consumables.length}`,
    );
}
