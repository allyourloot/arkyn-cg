import {
    type Client,
    Room,
} from "colyseus";
import { GameState } from "../shared/GameState";
import type { ServerAuthHandler, ServerClientJoinHandler, ServerClientLeaveHandler, ServerMessageHandler } from "./ServerRuntime";

export class GameRoom extends Room {
    autoDispose = false;
    maxClients = Number.MAX_SAFE_INTEGER;
    state = new GameState();
    private authHandler: ServerAuthHandler | null = null;
    private clientJoinHandlers: ServerClientJoinHandler[] = [];
    private clientLeaveHandlers: ServerClientLeaveHandler[] = [];

    onCreate(options: {
        state?: GameState;
        onTick?: () => void;
        messageHandlers?: Map<string, ServerMessageHandler>;
        authHandler?: ServerAuthHandler | null;
        clientJoinHandlers?: ServerClientJoinHandler[];
        clientLeaveHandlers?: ServerClientLeaveHandler[];
    }) {
        if (options?.state) {
            this.state = options.state;
        }
        this.authHandler = options?.authHandler ?? null;
        this.clientJoinHandlers = options?.clientJoinHandlers ?? [];
        this.clientLeaveHandlers = options?.clientLeaveHandlers ?? [];

        for (const [messageType, handler] of options?.messageHandlers ?? []) {
            this.onMessage(messageType, (client: Client, payload: unknown) => {
                handler(client, payload, this);
            });
        }

        this.setSimulationInterval(() => {
            options?.onTick?.();
        });
    }

    async onAuth(client: Client, options: unknown) {
        if (this.authHandler) {
            return await this.authHandler(client, options);
        }
        return true;
    }

    onJoin(client: Client, _options?: unknown, auth?: unknown) {
        for (const handler of this.clientJoinHandlers) {
            handler(client, auth, this);
        }
    }

    onLeave(client: Client) {
        for (const handler of this.clientLeaveHandlers) {
            handler(client, this);
        }
    }

    onDispose() { }
}
