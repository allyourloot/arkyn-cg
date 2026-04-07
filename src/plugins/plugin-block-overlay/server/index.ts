import { ServerPlugin } from "@core/server";
import { BlockOverlayState } from "../shared";

export function PluginBlockOverlayServer(): ServerPlugin {
    return new ServerPlugin({
        id: "plugin-block-overlay",
        name: "Block Overlay",
        version: "0.0.1",
        description: "Renders a wireframe highlight on the block the player is looking at.",
        author: "Hytopia",
        dependencies: [],
        init: async () => {
            return new BlockOverlayState();
        },
    });
}
