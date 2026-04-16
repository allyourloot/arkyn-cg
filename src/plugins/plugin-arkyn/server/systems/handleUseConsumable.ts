import { type ArkynState } from "../../shared";
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

    const element = player.consumables[index];
    if (!element) {
        logger.warn(`Use-consumable rejected: empty slot at index ${index}`);
        return;
    }

    // Apply scroll effect — increment the element's scroll level
    const currentLevel = player.scrollLevels.get(element) ?? 0;
    player.scrollLevels.set(element, currentLevel + 1);

    // Remove from consumable inventory
    player.consumables.splice(index, 1);

    logger.info(
        `Player ${client.sessionId} used ${element} scroll consumable ` +
        `(scroll level ${currentLevel + 1}). Consumables remaining: ${player.consumables.length}`,
    );
}
