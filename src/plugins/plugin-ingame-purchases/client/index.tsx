import { ClientPlugin, type ClientRuntime } from "@core/client";
import type { PluginState } from "@core/shared";
import { Logger } from "@core/shared/utils";
import { INGAME_PURCHASES_SHOW_PROMPT_MESSAGE } from "../shared";

const logger = new Logger("IngamePurchasesClient");

type ConnectionLike = {
    room?: {
        onMessage(type: string, callback: (payload: unknown) => void): void;
    };
};

type PromptPayload = {
    code: string;
};

function extractPromptCode(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") return null;
    const data = payload as Record<string, unknown>;
    return typeof data.code === "string" && data.code.length > 0 ? data.code : null;
}

export function PluginIngamePurchasesClient(): ClientPlugin {
    return new ClientPlugin({
        id: "plugin-ingame-purchases",
        name: "Ingame Purchases",
        version: "0.0.1",
        description: "Forwards in-game purchase prompts to the parent frame.",
        author: "Matt (@matt)",
        dependencies: [],
        init: async (runtime: ClientRuntime, _state: PluginState) => {
            const connection = runtime.getInterface<ConnectionLike>("connection");
            const room = connection?.room;
            if (!room) {
                logger.warn("No room connection available for in-game purchase prompts");
                return;
            }

            room.onMessage(INGAME_PURCHASES_SHOW_PROMPT_MESSAGE, (payload: unknown) => {
                const code = extractPromptCode(payload);
                if (!code) {
                    logger.warn("Received invalid in-game purchase prompt payload");
                    return;
                }

                const message = {
                    type: "startIngamePurchase",
                    data: { code },
                };
                globalThis.parent?.postMessage(message satisfies { type: string; data: PromptPayload }, "*");
            });

            logger.info("Ingame purchases client plugin initialized");
        },
    });
}
