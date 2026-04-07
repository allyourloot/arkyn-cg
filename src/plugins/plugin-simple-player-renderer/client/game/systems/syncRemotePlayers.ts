import type { Group, Scene } from "three";
import { ensurePlayerTemplateLoaded, getPlayerTemplate } from "../utils/playerModel";
import { commitRemoteServerState, getOrCreateRemotePlayerObject } from "../utils/remotePlayerState";
import type { MovementInterface } from "@plugins/plugin-movement/client";

export function createSyncRemotePlayersSystem(
    scene: Scene,
    localSessionId: string,
    movementState: MovementInterface,
    remotePlayerObjects: Map<string, Group>,
) {
    return () => {
        ensurePlayerTemplateLoaded();
        if (!getPlayerTemplate()) return;

        const seenSessionIds = new Set<string>();
        for (const [sessionId, playerState] of movementState.getPlayers()) {
            if (sessionId === localSessionId) continue;

            seenSessionIds.add(sessionId);
            const playerObject = getOrCreateRemotePlayerObject(remotePlayerObjects, scene, sessionId, playerState);
            commitRemoteServerState(playerObject, playerState);
        }

        for (const [sessionId, playerObject] of remotePlayerObjects.entries()) {
            if (seenSessionIds.has(sessionId)) continue;
            scene.remove(playerObject);
            remotePlayerObjects.delete(sessionId);
        }
    };
}
