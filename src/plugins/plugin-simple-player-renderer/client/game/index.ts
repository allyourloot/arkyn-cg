import type { ClientRuntime } from "@core/client";
import { Logger } from "@core/shared/utils";
import type { ThreeJSRendererInterface } from "@plugins/plugin-threejs-renderer/client";
import { Group } from "three";
import { createAnimateRemotePlayersSystem } from "./systems/animateRemotePlayers";
import { createSyncRemotePlayersSystem } from "./systems/syncRemotePlayers";
import type { MovementInterface } from "@plugins/plugin-movement/client";
import type { SimplePlayerRendererInterface } from "../interfaces/SimplePlayerRendererInterface";

const logger = new Logger("SimplePlayerRendererClient");

type ConnectionLike = {
    room?: {
        sessionId: string;
    };
};

export function initSimplePlayerRendererGame(runtime: ClientRuntime) {
    const renderer = runtime.getInterface<ThreeJSRendererInterface>("renderer");
    if (!renderer) {
        logger.warn("Renderer interface not found");
        return;
    }

    const connection = runtime.getInterface<ConnectionLike>("connection");
    const room = connection?.room;
    if (!room) {
        logger.warn("No room connection available");
        return;
    }

    const movementInterface = runtime.getInterface<MovementInterface>("movement");
    if (!movementInterface) {
        logger.warn("Movement interface not found; remote players cannot be synchronized");
        return;
    }

    const scene = renderer.getScene();
    const remotePlayerObjects = new Map<string, Group>();
    const rendererInterface: SimplePlayerRendererInterface = {
        getRemotePlayerObject: (sessionId: string) => remotePlayerObjects.get(sessionId) ?? null,
        getRemotePlayerObjects: () => remotePlayerObjects.entries(),
    };

    runtime.addInterface("simple-player-renderer", rendererInterface);

    runtime.addSystem(
        "PRE_UPDATE",
        createSyncRemotePlayersSystem(scene, room.sessionId, movementInterface, remotePlayerObjects),
    );
    runtime.addSystem("UPDATE", createAnimateRemotePlayersSystem(remotePlayerObjects, scene));

    logger.info("Simple player renderer client game initialized");
}
