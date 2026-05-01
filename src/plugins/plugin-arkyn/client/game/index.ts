import type { ClientRuntime } from "@core/client";
import type { ArkynState } from "../../shared";
import { setConnection } from "../arkynStore";
import { sendLoadProfile } from "../arkynNetwork";
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

    // Auto-fire a lightweight profile preload so the Achievements modal
    // (openable from the main menu before any run starts) has real data
    // to show. Server creates a menu-phase player schema with achievements,
    // lifetime stats, and personal bests populated. Click-Play later
    // replaces it with a full "playing" player via ARKYN_JOIN.
    sendLoadProfile();
}
