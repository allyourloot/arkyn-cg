import { ServerPlugin, type ServerRuntime } from "@core/server";
import { Logger } from "@core/shared/utils";
import {
    ENSURE_PLAYER_MESSAGE,
    SELECT_SLOT_MESSAGE,
    SET_ITEM_MESSAGE,
    SimpleHotbarState,
} from "../shared";
import { ensureHotbarPlayer } from "./systems/ensureHotbarPlayer";
import { removeHotbarPlayer } from "./systems/removeHotbarPlayer";
import { selectHotbarSlot } from "./systems/selectHotbarSlot";
import { setHotbarItem } from "./systems/setHotbarItem";

const logger = new Logger("SimpleHotbarServer");
type ServerClientRef = { sessionId: string };

export function PluginSimpleHotbarServer(): ServerPlugin {
    return new ServerPlugin({
        id: "plugin-simple-hotbar",
        name: "Simple Hotbar",
        version: "0.0.1",
        description: "A simple hotbar plugin for managing player item slots.",
        author: "Matt (@matt)",
        dependencies: ["plugin-voxel-world"],
        init: async (runtime: ServerRuntime) => {
            const state = new SimpleHotbarState();
            runtime.onMessage(ENSURE_PLAYER_MESSAGE, (client: ServerClientRef) => {
                ensureHotbarPlayer(state, client);
            });
            runtime.onMessage(SELECT_SLOT_MESSAGE, (client: ServerClientRef, payload: unknown) => {
                selectHotbarSlot(state, client, payload);
            });
            runtime.onMessage(SET_ITEM_MESSAGE, (client: ServerClientRef, payload: unknown) => {
                setHotbarItem(state, client, payload);
            });

            runtime.onClientLeave((client: ServerClientRef) => {
                removeHotbarPlayer(state, client);
            });

            logger.info("Simple hotbar server plugin initialized");
            return state;
        },
    });
}
