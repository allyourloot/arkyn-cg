import { ClientPlugin, type ClientRuntime } from "@core/client";
import type { PluginState } from "@core/shared";
import { Logger } from "@core/shared/utils";
import { initSimpleFakeCursorGame } from "./game";
import type { FakeCursorPointerEvent, SimpleFakeCursorClientInterface } from "./fakeCursorStore";

const logger = new Logger("SimpleFakeCursorClient");

export function PluginSimpleFakeCursorClient(): ClientPlugin {
    return new ClientPlugin({
        id: "plugin-simple-fake-cursor",
        name: "Simple Fake Cursor",
        version: "0.0.1",
        description: "Tracks a fake cursor under pointer lock and exposes cursor events.",
        author: "Matt (@matt)",
        dependencies: [],
        clientOnly: true,
        init: async (runtime: ClientRuntime, _state: PluginState) => {
            initSimpleFakeCursorGame(runtime);
            logger.info("Simple fake cursor client plugin initialized");
        },
    });
}

export type {
    FakeCursorPointerEvent,
    SimpleFakeCursorClientInterface,
};
