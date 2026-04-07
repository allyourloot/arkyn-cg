import { Logger } from "@core/shared/utils";
import type { SimpleHotbarState } from "../../shared";
import { getOrCreatePlayerState } from "../resources/hotbarPlayers";

const logger = new Logger("SimpleHotbarServer");

export function ensureHotbarPlayer(state: SimpleHotbarState, client: { sessionId: string }) {
    getOrCreatePlayerState(state, client.sessionId);
    logger.info(`Ensured hotbar state for player ${client.sessionId}`);
}
