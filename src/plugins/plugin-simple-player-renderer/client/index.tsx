import { ClientPlugin, type ClientRuntime } from "@core/client";
import type { PluginState } from "@core/shared";
import { Logger } from "@core/shared/utils";
import { initSimplePlayerRendererGame } from "./game";
import type { SimplePlayerRendererInterface } from "./interfaces/SimplePlayerRendererInterface";

const logger = new Logger("SimplePlayerRendererClient");

export function PluginSimplePlayerRendererClient(): ClientPlugin {
    return new ClientPlugin({
        id: "plugin-simple-player-renderer",
        name: "Simple Player Renderer",
        version: "0.0.1",
        description: "Renders remote players with model loading and look-direction rotation.",
        author: "Matt (@matt)",
        dependencies: ["plugin-threejs-renderer", "plugin-movement"],
        init: async (runtime: ClientRuntime, _state: PluginState) => {
            initSimplePlayerRendererGame(runtime);
            logger.info("Simple player renderer client plugin initialized");
        },
    });
}

export type { SimplePlayerRendererInterface };
