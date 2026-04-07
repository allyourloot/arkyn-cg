import { ServerPlugin, type ServerRuntime } from "@core/server";
import { Logger } from "@core/shared/utils";
import { access, copyFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
    GENERATED_PLAYER_MODEL_PATH,
    PlayerRendererState,
    SOURCE_PLAYER_MODEL_PATH,
} from "../shared";
import { removePlayer } from "./systems/removePlayer";
import { updatePlayerPosition } from "./systems/updatePlayerPosition";

const logger = new Logger("SimplePlayerRendererServer");
const UPDATE_POSITION_MESSAGE = "player-renderer:update-position";
type ServerClientRef = { sessionId: string };

async function ensureGeneratedPlayerModel() {
    try {
        await access(SOURCE_PLAYER_MODEL_PATH);
    } catch {
        logger.warn(`Player model source not found at ${SOURCE_PLAYER_MODEL_PATH}`);
        return;
    }

    try {
        await mkdir(dirname(GENERATED_PLAYER_MODEL_PATH), { recursive: true });
        await copyFile(SOURCE_PLAYER_MODEL_PATH, GENERATED_PLAYER_MODEL_PATH);
        logger.info(`Copied player model to ${GENERATED_PLAYER_MODEL_PATH}`);
    } catch (error) {
        logger.warn(`Failed to copy player model: ${String(error)}`);
    }
}

export function PluginSimplePlayerRendererServer(): ServerPlugin {
    return new ServerPlugin({
        id: "plugin-simple-player-renderer",
        name: "Simple Player Renderer",
        version: "0.0.1",
        description: "Tracks and publishes player position for client-side remote player rendering.",
        author: "Matt (@matt)",
        dependencies: [],
        init: async (runtime: ServerRuntime) => {
            await ensureGeneratedPlayerModel();
            const state = new PlayerRendererState();

            runtime.onMessage(UPDATE_POSITION_MESSAGE, (client: ServerClientRef, payload: unknown) => {
                updatePlayerPosition(state, client, payload);
            });

            runtime.onClientLeave((client: ServerClientRef) => {
                removePlayer(state, client);
            });

            logger.info("Simple player renderer server plugin initialized");
            return state;
        },
    });
}
