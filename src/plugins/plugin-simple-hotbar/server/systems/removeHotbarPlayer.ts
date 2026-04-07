import { Logger } from "@core/shared/utils";
import type { SimpleHotbarState } from "../../shared";

const logger = new Logger("SimpleHotbarServer");

export function removeHotbarPlayer(state: SimpleHotbarState, client: { sessionId: string }) {
    state.players.delete(client.sessionId);
    logger.info(`Removed hotbar state for player ${client.sessionId}`);
}
