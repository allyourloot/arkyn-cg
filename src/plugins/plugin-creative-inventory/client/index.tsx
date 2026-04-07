import { ClientPlugin, type ClientRuntime } from "@core/client";
import type { PluginState } from "@core/shared";
import { Logger } from "@core/shared/utils";
import CreativeInventoryUI from "./ui";
import { initCreativeInventoryGame } from "./game";

const logger = new Logger("CreativeInventoryClient");
export function PluginCreativeInventoryClient(): ClientPlugin {
    return new ClientPlugin({
        id: "plugin-creative-inventory",
        name: "Creative Inventory",
        version: "0.0.1",
        description: "Browse blocks and drag them into the hotbar",
        author: "Hytopia",
        dependencies: ["plugin-simple-hotbar", "plugin-voxel-world", "plugin-voxel-world-renderer", "plugin-simple-fake-cursor"],
        init: async (runtime: ClientRuntime, _state: PluginState) => {
            runtime.addOverlay(<CreativeInventoryUI />);
            initCreativeInventoryGame(runtime);
            logger.info("Creative inventory client plugin initialized");
        },
    });
}
