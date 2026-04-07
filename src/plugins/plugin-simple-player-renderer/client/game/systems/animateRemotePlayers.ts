import type { Group, Scene } from "three";
import { animateRemotePlayerLegs, animateRemotePlayerLook } from "../utils/playerAnimation";
import { interpolateRemotePlayer, type RemotePlayerRenderData } from "../utils/remotePlayerState";
import { updatePlayerShadow } from "../utils/playerShadow";

export function createAnimateRemotePlayersSystem(remotePlayerObjects: Map<string, Group>, scene: Scene) {
    return () => {
        for (const playerObject of remotePlayerObjects.values()) {
            interpolateRemotePlayer(playerObject);
            animateRemotePlayerLegs(playerObject);
            animateRemotePlayerLook(playerObject);

            const { shadow } = playerObject.userData as RemotePlayerRenderData;
            if (shadow) {
                updatePlayerShadow(shadow, playerObject, scene);
            }
        }
    };
}
