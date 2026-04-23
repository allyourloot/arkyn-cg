import { ServerPlugin, type ServerRuntime } from "@core/server";
import { Logger } from "@core/shared/utils";
import type { AuthPluginInterface } from "@plugins/plugin-auth/server";
import type { SaveStatesInterface } from "@plugins/plugin-save-states/server";
import {
    ARKYN_JOIN,
    ARKYN_CAST,
    ARKYN_DISCARD,
    ARKYN_READY,
    ARKYN_COLLECT_ROUND_GOLD,
    ARKYN_NEW_RUN,
    ARKYN_BUY_ITEM,
    ARKYN_SELL_SIGIL,
    ARKYN_REORDER_SIGILS,
    ARKYN_USE_CONSUMABLE,
    ARKYN_PICK_BAG_RUNE,
    ARKYN_REROLL_SHOP,
    ARKYN_DEBUG_GRANT_SIGIL,
    ArkynState,
} from "../shared";
import { createArkynContext } from "./types/ArkynContext";
import { handleJoin } from "./systems/handleJoin";
import { handleCast } from "./systems/handleCast";
import { handleDiscard } from "./systems/handleDiscard";
import { handleReady } from "./systems/handleReady";
import { handleCollectRoundGold } from "./systems/handleCollectRoundGold";
import { handleNewRun } from "./systems/handleNewRun";
import { handleBuyItem } from "./systems/handleBuyItem";
import { handleSellSigil } from "./systems/handleSellSigil";
import { handleReorderSigils } from "./systems/handleReorderSigils";
import { handleUseConsumable } from "./systems/handleUseConsumable";
import { handleBagChoice } from "./systems/handleBagChoice";
import { handleRerollShop } from "./systems/handleRerollShop";
import { handleDebugGrantSigil } from "./systems/handleDebugGrantSigil";
import { handleLeave } from "./systems/handleLeave";

const logger = new Logger("ArkynServer");
type ServerClientRef = { sessionId: string };

export function PluginArkynServer(): ServerPlugin {
    return new ServerPlugin({
        id: "plugin-arkyn",
        name: "Arkyn",
        version: "0.0.1",
        description: "Arkyn - Fantasy Roguelike Rune Game",
        author: "Arkyn",
        dependencies: ["auth"],
        init: async (runtime: ServerRuntime) => {
            const state = new ArkynState();

            const auth = runtime.getInterface<AuthPluginInterface>("auth") ?? null;
            const saveStates = runtime.getInterface<SaveStatesInterface>("save-states") ?? null;
            const ctx = createArkynContext(auth, saveStates);

            runtime.onMessage(ARKYN_JOIN, (client: ServerClientRef) => {
                handleJoin(state, client, ctx);
            });

            runtime.onMessage(ARKYN_CAST, (client: ServerClientRef, payload: unknown) => {
                handleCast(state, client, payload, ctx);
            });

            runtime.onMessage(ARKYN_DISCARD, (client: ServerClientRef, payload: unknown) => {
                handleDiscard(state, client, payload);
            });

            runtime.onMessage(ARKYN_READY, (client: ServerClientRef) => {
                handleReady(state, client);
            });

            runtime.onMessage(ARKYN_COLLECT_ROUND_GOLD, (client: ServerClientRef) => {
                handleCollectRoundGold(state, client);
            });

            runtime.onMessage(ARKYN_BUY_ITEM, (client: ServerClientRef, payload: unknown) => {
                handleBuyItem(state, client, payload);
            });

            runtime.onMessage(ARKYN_SELL_SIGIL, (client: ServerClientRef, payload: unknown) => {
                handleSellSigil(state, client, payload);
            });

            runtime.onMessage(ARKYN_REORDER_SIGILS, (client: ServerClientRef, payload: unknown) => {
                handleReorderSigils(state, client, payload);
            });

            runtime.onMessage(ARKYN_USE_CONSUMABLE, (client: ServerClientRef, payload: unknown) => {
                handleUseConsumable(state, client, payload);
            });

            runtime.onMessage(ARKYN_PICK_BAG_RUNE, (client: ServerClientRef, payload: unknown) => {
                handleBagChoice(state, client, payload);
            });

            runtime.onMessage(ARKYN_REROLL_SHOP, (client: ServerClientRef) => {
                handleRerollShop(state, client);
            });

            runtime.onMessage(ARKYN_NEW_RUN, (client: ServerClientRef) => {
                handleNewRun(state, client, ctx);
            });

            runtime.onMessage(ARKYN_DEBUG_GRANT_SIGIL, (client: ServerClientRef, payload: unknown) => {
                handleDebugGrantSigil(state, client, payload);
            });

            runtime.onClientLeave((client: ServerClientRef) => {
                handleLeave(state, client, ctx);
            });

            logger.info("Arkyn server plugin initialized");
            return state;
        },
    });
}
