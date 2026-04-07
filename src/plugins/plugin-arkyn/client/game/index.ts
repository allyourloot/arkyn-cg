import type { ClientRuntime } from "@core/client";
import type { ArkynState } from "../../shared";
import { setConnection, joinGame } from "../arkynStore";
import { createSyncArkynStateSystem } from "./systems/syncArkynState";

export function initArkynGame(runtime: ClientRuntime, state: ArkynState) {
    const connection = runtime.getInterface<{ room: { send: (type: string, data: unknown) => void; sessionId: string } }>("connection");

    if (!connection?.room) {
        console.error("[Arkyn] No connection available");
        return;
    }

    const room = connection.room;

    // Wire up message sending
    setConnection((type, data) => room.send(type, data));

    // Register state sync system
    runtime.addSystem("PRE_UPDATE", createSyncArkynStateSystem(state, room.sessionId));

    // Auto-join the game
    joinGame();
}
