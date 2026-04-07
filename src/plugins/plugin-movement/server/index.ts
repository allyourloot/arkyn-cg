import { ServerPlugin, type ServerRuntime } from "@core/server";
import {
    MOVEMENT_UPDATE_POSITION_MESSAGE,
    MovementState,
} from "../shared";
import { removePlayer } from "./systems/removePlayer";
import { updatePlayerPosition } from "./systems/updatePlayerPosition";

export function PluginMovementServer(): ServerPlugin {
    return new ServerPlugin({
        id: "plugin-movement",
        name: "Movement",
        version: "0.0.1",
        description: "Movement state plugin",
        author: "Hytopia",
        dependencies: [],
        init: async (runtime: ServerRuntime) => {
            const state = new MovementState();

            runtime.onMessage(MOVEMENT_UPDATE_POSITION_MESSAGE, (client, payload) => {
                updatePlayerPosition(state, client, payload);
            });

            runtime.onClientLeave((client) => {
                removePlayer(state, client);
            });

            return state;
        },
    });
}
