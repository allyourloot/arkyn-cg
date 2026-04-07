import { ClientPlugin, type ClientRuntime } from "@core/client";
import type { PluginState } from "@core/shared";
import { Logger } from "@core/shared/utils";
import type { AuthClientInterface } from "@plugins/plugin-auth/client";
import type { MovementInterface } from "@plugins/plugin-movement/client";
import type { ThreeJSRendererInterface } from "@plugins/plugin-threejs-renderer/client";
import NameplatesOverlay from "./ui/NameplatesOverlay";
import { createSyncNameplatesSystem } from "./systems/syncNameplates";

const logger = new Logger("PlayerNameplatesClient");

type ConnectionLike = {
    room?: {
        sessionId: string;
    };
};

export function PluginPlayerNameplatesClient(): ClientPlugin {
    return new ClientPlugin({
        id: "plugin-player-nameplates",
        name: "Player Nameplates",
        version: "0.0.1",
        description: "Displays player usernames above their heads.",
        author: "HYTOPIA",
        dependencies: ["plugin-threejs-renderer", "plugin-movement", "auth"],
        clientOnly: true,
        init: async (runtime: ClientRuntime, _state: PluginState) => {
            const renderer = runtime.getInterface<ThreeJSRendererInterface>("renderer");
            const movement = runtime.getInterface<MovementInterface>("movement");
            const auth = runtime.getInterface<AuthClientInterface>("auth");
            const connection = runtime.getInterface<ConnectionLike>("connection");
            const room = connection?.room;

            if (!renderer || !movement || !auth || !room) {
                logger.warn("Missing renderer, movement, auth, or room connection");
                return;
            }

            runtime.addOverlay(<NameplatesOverlay />);
            runtime.addSystem(
                "UPDATE",
                createSyncNameplatesSystem(movement, auth, renderer.getCamera(), room.sessionId),
            );

            logger.info("Player nameplates initialized");
        },
    });
}
