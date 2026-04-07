import { Logger } from "@core/shared/utils";
import type { AuthPluginInterface } from "@plugins/plugin-auth/server";
import { fetchPlayerState } from "../utils/fetchPlayerState";

const logger = new Logger("SaveStatesServer");

export function createOnClientJoinHandler(apiKey: string, gameId: string, authInterface: AuthPluginInterface, cache: Map<string, unknown>, versions: Map<string, number>) {
    return async (client: { sessionId: string }) => {
        const authUser = authInterface.getUserBySessionId(client.sessionId);
        if (!authUser) {
            logger.warn(`No auth data for session ${client.sessionId}`);
            return;
        }

        const result = await fetchPlayerState(apiKey, gameId, authUser.userId);
        if (result !== null) {
            cache.set(authUser.userId, result.state);
            versions.set(authUser.userId, result.version);
            logger.info(`Loaded save state for ${authUser.userId} (v${result.version})`);
        }
    };
}
