import { type ArkynState, getConsumableDefinition } from "../../shared";
import { Logger } from "@core/shared/utils";

const logger = new Logger("ArkynUseConsumable");

export function handleUseConsumable(
    state: ArkynState,
    client: { sessionId: string },
    payload: unknown,
): void {
    const player = state.players.get(client.sessionId);
    if (!player) {
        logger.warn(`Use-consumable rejected: player ${client.sessionId} not found`);
        return;
    }

    if (state.gamePhase !== "playing" && state.gamePhase !== "shop") {
        logger.warn(`Use-consumable rejected: game phase is ${state.gamePhase}`);
        return;
    }

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
            player.scrollLevels.set(element, currentLevel + 1);
            logDetail = `${element} scroll → level ${currentLevel + 1}`;
            break;
        }
    }

    player.consumables.splice(index, 1);

    logger.info(
        `Player ${client.sessionId} used ${def.name}${logDetail ? ` (${logDetail})` : ""}. ` +
        `Consumables remaining: ${player.consumables.length}`,
    );
}
