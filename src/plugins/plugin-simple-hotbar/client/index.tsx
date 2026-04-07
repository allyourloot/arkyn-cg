import { ClientPlugin, type ClientRuntime } from "@core/client";
import type { PluginState } from "@core/shared";
import { Logger } from "@core/shared/utils";
import type { SimpleHotbarState } from "../shared";
import { initSimpleHotbarGame } from "./game";
import { type SimpleHotbarClientInterface } from "./hotbarStore";
import SimpleHotbarUI from "./ui";

const logger = new Logger("SimpleHotbarClient");

export function PluginSimpleHotbarClient(): ClientPlugin {
    return new ClientPlugin({
        id: "plugin-simple-hotbar",
        name: "Simple Hotbar",
        version: "0.0.1",
        description: "A simple hotbar plugin for managing player item slots.",
        author: "Matt (@matt)",
        dependencies: ["plugin-voxel-world", "plugin-voxel-world-renderer"],
        init: async (runtime: ClientRuntime, state: PluginState) => {
            runtime.addOverlay(<SimpleHotbarUI />);
            initSimpleHotbarGame(runtime, state as SimpleHotbarState);
            logger.info("Simple hotbar client plugin initialized");
        },
    });
}

export type { SimpleHotbarClientInterface };
