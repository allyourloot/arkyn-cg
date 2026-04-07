import { ServerPlugin } from "@core/server";
import { Logger } from "@core/shared/utils";
import { ThreeJSRendererState } from "../shared/ThreeJSRendererState";
import { generateTextureAtlas } from "./systems/generateTextureAtlas";

const logger = new Logger("WorldRenderer");

export function PluginVoxelWorldRendererServer(): ServerPlugin {
    return new ServerPlugin({
        id: "plugin-voxel-world-renderer",
        name: "Voxel World Renderer",
        version: "0.0.1",
        description: "Voxel world renderer plugin",
        author: "Hytopia",
        dependencies: ["plugin-voxel-world"],
        init: async () => {
            generateTextureAtlas(logger);
            return new ThreeJSRendererState();
        },
    });
}
