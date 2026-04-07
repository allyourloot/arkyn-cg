import { ServerPlugin, type ServerRuntime } from "@core/server";
import { Logger } from "@core/shared/utils";
import {
    ARKYN_JOIN,
    ARKYN_CAST,
    ARKYN_DISCARD,
    ARKYN_READY,
    ArkynState,
} from "../shared";
import { handleJoin } from "./systems/handleJoin";
import { handleCast } from "./systems/handleCast";
import { handleDiscard } from "./systems/handleDiscard";
import { handleReady } from "./systems/handleReady";
import { handleLeave } from "./systems/handleLeave";

const logger = new Logger("ArkynServer");
type ServerClientRef = { sessionId: string };

export function PluginArkynServer(): ServerPlugin {
    return new ServerPlugin({
        id: "plugin-arkyn",
        name: "Arkyn",
        version: "0.0.1",
        description: "Arkyn - Fantasy Roguelike Rune Game",
        author: "Arkyn",
        dependencies: [],
        init: async (runtime: ServerRuntime) => {
            const state = new ArkynState();

            runtime.onMessage(ARKYN_JOIN, (client: ServerClientRef) => {
                handleJoin(state, client);
            });

            runtime.onMessage(ARKYN_CAST, (client: ServerClientRef, payload: unknown) => {
                handleCast(state, client, payload);
            });

            runtime.onMessage(ARKYN_DISCARD, (client: ServerClientRef, payload: unknown) => {
                handleDiscard(state, client, payload);
            });

            runtime.onMessage(ARKYN_READY, (client: ServerClientRef) => {
                handleReady(state, client);
            });

            runtime.onClientLeave((client: ServerClientRef) => {
                handleLeave(state, client);
            });

            logger.info("Arkyn server plugin initialized");
            return state;
        },
    });
}
