import type { ArkynState } from "../../shared";
import { Logger } from "@core/shared/utils";
import { removePouch } from "../resources/playerPouch";

const logger = new Logger("ArkynLeave");

export function handleLeave(
    state: ArkynState,
    client: { sessionId: string },
): void {
    state.players.delete(client.sessionId);
    removePouch(client.sessionId);
    logger.info(`Player ${client.sessionId} left, state cleaned up`);
}
