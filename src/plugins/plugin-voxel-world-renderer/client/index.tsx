import { ClientPlugin, type ClientRuntime } from "@core/client";
import { Logger } from "@core/shared/utils";
import type { ThreeJSRendererInterface } from "@plugins/plugin-threejs-renderer/client";
import type { VoxelWorldClientInterface } from "@plugins/plugin-voxel-world/client";
import WorldRendererGame from "./game";

const logger = new Logger("VoxelWorldRendererClient");

export function PluginVoxelWorldRendererClient() : ClientPlugin {
    return new ClientPlugin({
        id: "plugin-voxel-world-renderer",
        name: "Voxel World Renderer",
        version: "0.0.1",
        description: "Voxel World Renderer",
        author: "Hytopia",
        dependencies: ["plugin-threejs-renderer", "plugin-voxel-world"],
        clientOnly: true,
        init: async (runtime) => init(runtime),
    });
}

let initialized = false;
async function init(runtime: ClientRuntime) {
    runtime.addSystem("PRE_UPDATE", async () => {
        if (initialized) return;

        const renderer = runtime.getInterface<ThreeJSRendererInterface>("renderer");
        if (!renderer) {
            logger.error("Renderer not found");
            return;
        }

        const voxelWorld = runtime.getInterface<VoxelWorldClientInterface>("voxel-world");
        if (!voxelWorld) {
            logger.error("VoxelWorld not found");
            return;
        }

        initialized = true;
        await WorldRendererGame(runtime);
        logger.info("Initialized");
    });
}

export type { VoxelWorldClientInterface };
export type { VoxelWorldRendererClientInterface, BlockFace, UvRect } from "./interfaces";