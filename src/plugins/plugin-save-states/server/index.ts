import { ServerPlugin, type ServerRuntime } from "@core/server";
import { Logger, requireHytopiaAuth } from "@core/shared/utils";
import type { AuthPluginInterface } from "@plugins/plugin-auth/server";
import { SaveStatesState } from "../shared/SaveStatesState";
import { SaveStatesInterfaceImpl } from "./interfaces/SaveStatesInterfaceImpl";
import { createOnClientJoinHandler } from "./systems/onClientJoin";
import { createOnClientLeaveHandler } from "./systems/onClientLeave";
import { startFlushWorker } from "./systems/flushWorker";
import type { SaveStatesInterface } from "./interfaces/SaveStatesInterface";

const logger = new Logger("SaveStatesServer");

export function PluginSaveStatesServer(): ServerPlugin {
    const { apiKey, gameId } = requireHytopiaAuth();
    return new ServerPlugin({
        id: "plugin-save-states",
        name: "Save States",
        version: "0.0.1",
        description: "Loads and caches player save states from KV store.",
        author: "HYTOPIA",
        dependencies: ["auth"],
        init: async (runtime: ServerRuntime) => {
            const state = new SaveStatesState();
            const cache = new Map<string, unknown>();
            const versions = new Map<string, number>();
            const proxies = new Map<string, unknown>();
            const dirty = new Set<string>();
            const pendingCleanup = new Set<string>();

            const authInterface = runtime.getInterface<AuthPluginInterface>("auth");
            if (!authInterface) {
                logger.warn("Auth interface not found, save states will not load");
                return state;
            }

            runtime.addInterface("save-states", new SaveStatesInterfaceImpl(cache, versions, proxies, dirty));
            runtime.onClientJoin(createOnClientJoinHandler(apiKey, gameId, authInterface, cache, versions));
            runtime.onClientLeave(createOnClientLeaveHandler(authInterface, dirty, pendingCleanup));

            startFlushWorker(apiKey, gameId, cache, versions, proxies, dirty, pendingCleanup);

            logger.info("Save states plugin initialized");
            return state;
        },
    });
}

export type { SaveStatesInterface };
