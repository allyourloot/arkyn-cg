import { type ArkynState } from "../../shared";
import { SIGIL_DEFINITIONS } from "../../shared/sigils";
import { Logger } from "@core/shared/utils";

const logger = new Logger("ArkynSellSigil");

export function handleSellSigil(
    state: ArkynState,
    client: { sessionId: string },
    payload: unknown,
): void {
    const player = state.players.get(client.sessionId);
    if (!player) {
        logger.warn(`Sell rejected: player ${client.sessionId} not found`);
        return;
    }

    const data = payload as { sigilId?: string };
    const sigilId = data?.sigilId;
    if (typeof sigilId !== "string") {
        logger.warn(`Sell rejected: invalid sigilId`);
        return;
    }

    const def = SIGIL_DEFINITIONS[sigilId];
    if (!def) {
        logger.warn(`Sell rejected: unknown sigil "${sigilId}"`);
        return;
    }

    // Find the sigil in the player's owned list
    const idx = Array.from(player.sigils).indexOf(sigilId);
    if (idx < 0) {
        logger.warn(`Sell rejected: player does not own sigil "${sigilId}"`);
        return;
    }

    // Remove sigil and credit gold
    player.sigils.splice(idx, 1);
    player.gold += def.sellPrice;

    logger.info(
        `Player ${client.sessionId} sold sigil "${sigilId}" for ${def.sellPrice} gold. ` +
        `Gold remaining: ${player.gold}`,
    );
}
