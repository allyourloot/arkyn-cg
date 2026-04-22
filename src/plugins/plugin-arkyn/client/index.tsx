import { ClientPlugin, type ClientRuntime } from "@core/client";
import type { PluginState } from "@core/shared";
import { Logger } from "@core/shared/utils";
import type { ArkynState } from "../shared";
import { initArkynGame } from "./game";
import ArkynOverlay from "./ui/ArkynOverlay";
// Side-effect import: registers GSAP's `useGSAP` plugin once at app load.
// MUST be imported before any UI component calls `useGSAP()`.
import "./animations/registerGsap";
// Side-effect import: attaches `window.arkyn` debug helpers for dev
// testing (see debugCommands.ts for usage). Remove before shipping.
import "./debugCommands";

const logger = new Logger("ArkynClient");

export function PluginArkynClient(): ClientPlugin {
    return new ClientPlugin({
        id: "plugin-arkyn",
        name: "Arkyn",
        version: "0.0.1",
        description: "Arkyn - Fantasy Roguelike Rune Game",
        author: "Arkyn",
        dependencies: [],
        init: async (runtime: ClientRuntime, state: PluginState) => {
            runtime.addOverlay(<ArkynOverlay />);
            initArkynGame(runtime, state as ArkynState);
            logger.info("Arkyn client plugin initialized");
        },
    });
}
