import { ClientPlugin, type ClientRuntime } from "@core/client";
import type { PluginState } from "@core/shared";
import { Logger } from "@core/shared/utils";
import type { PlayerCosmeticsState } from "../shared";
import type { PlayerCosmeticsClientInterface } from "./interfaces/PlayerCosmeticsClientInterface";
import { initPlayerCosmeticsClientGame } from "./game";

const logger = new Logger("PlayerCosmeticsClient");

export function PluginPlayerCosmeticsClient(): ClientPlugin {
    return new ClientPlugin({
        id: "plugin-player-cosmetics",
        name: "Player Cosmetics",
        version: "0.0.1",
        description: "Attaches cosmetic loadout models to remote players.",
        author: "Matt (@matt)",
        dependencies: ["plugin-simple-player-renderer"],
        init: async (runtime: ClientRuntime, state: PluginState) => {
            const pluginInterface = initPlayerCosmeticsClientGame(runtime, state as PlayerCosmeticsState);
            if (pluginInterface) {
                runtime.addInterface("player-cosmetics", pluginInterface as PlayerCosmeticsClientInterface);
            }
            logger.info("Player cosmetics client plugin initialized");
        },
    });
}

export type { PlayerCosmeticsClientInterface };
