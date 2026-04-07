import { ServerPlugin, type ServerRuntime } from "@core/server";
import { Logger, requireHytopiaAuth } from "@core/shared/utils";
import type { AuthPluginInterface } from "@plugins/plugin-auth/server";
import { IngamePurchasesState, INGAME_PURCHASES_SHOW_PROMPT_MESSAGE } from "../shared";
import { IngamePurchasesInterfaceImpl } from "./interfaces/IngamePurchasesInterfaceImpl";
import type {
    IngamePurchasePromptPayload,
    IngamePurchasesInterface,
    StartPurchaseData,
    StartPurchaseError,
    StartPurchaseParams,
    StartPurchaseResult,
} from "./interfaces/IngamePurchasesInterface";

const logger = new Logger("IngamePurchasesServer");

export function PluginIngamePurchasesServer(): ServerPlugin {
    const { apiKey, gameId } = requireHytopiaAuth();

    return new ServerPlugin({
        id: "plugin-ingame-purchases",
        name: "Ingame Purchases",
        version: "0.0.1",
        description: "Starts and polls in-game purchases from Persuade Creative APIs.",
        author: "Matt (@matt)",
        dependencies: ["auth"],
        init: async (runtime: ServerRuntime) => {
            const state = new IngamePurchasesState();
            const authInterface = runtime.getInterface<AuthPluginInterface>("auth");
            if (!authInterface) {
                logger.warn("Auth interface not found, ingame purchases interface disabled");
                return state;
            }

            const clientsBySessionId = new Map<string, { send(type: string, data: unknown): void }>();
            runtime.onClientJoin((client: { sessionId: string; send(type: string, data: unknown): void }) => {
                clientsBySessionId.set(client.sessionId, client);
            });
            runtime.onClientLeave((client: { sessionId: string }) => {
                clientsBySessionId.delete(client.sessionId);
            });

            const showPromptForUser = (payload: IngamePurchasePromptPayload) => {
                const authUser = authInterface.getAllUsers().find((entry) => entry.userId === payload.userId);
                if (!authUser) {
                    throw new Error(`Cannot show purchase prompt: userId ${payload.userId} not found in auth plugin`);
                }

                const client = clientsBySessionId.get(authUser.sessionId);
                if (!client) {
                    throw new Error(`Cannot show purchase prompt: session ${authUser.sessionId} is not connected`);
                }

                client.send(INGAME_PURCHASES_SHOW_PROMPT_MESSAGE, payload);
            };

            runtime.addInterface("ingame-purchases", new IngamePurchasesInterfaceImpl(apiKey, gameId, showPromptForUser));
            logger.info("Ingame purchases server plugin initialized");
            return state;
        },
    });
}

export type {
    IngamePurchasePromptPayload,
    IngamePurchasesInterface,
    StartPurchaseData,
    StartPurchaseError,
    StartPurchaseParams,
    StartPurchaseResult,
};
