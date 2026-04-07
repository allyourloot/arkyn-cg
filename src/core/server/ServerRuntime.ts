import { matchMaker } from "colyseus";
import { createColyseusServer } from "./ColyseusServer";
import { GameState } from "../shared";
import type { ServerSystem } from "./ServerSystem";
import type { ServerSystemPhase } from "./ServerSystemPhase";
import { Logger } from "../shared/utils";

export type ServerMessageHandler = (client: { sessionId: string }, payload: unknown, room: unknown) => void;
export type ServerAuthHandler = (client: { sessionId: string }, options: unknown) => Promise<unknown> | unknown;
export type ServerClientJoinHandler = (client: { sessionId: string; send(type: string, data: unknown): void }, auth: unknown, room: unknown) => void;
export type ServerClientLeaveHandler = (client: { sessionId: string }, room: unknown) => void;

const logger = new Logger("ServerRuntime");
export class ServerRuntime {
    private readonly _systems: Map<ServerSystemPhase, ServerSystem[]> = new Map();
    private readonly _interfaces: Map<string, unknown> = new Map();

    // Config
    private _simulatedLatency: number = 0;

    // Hooks
    private _authHandler: ServerAuthHandler | null = null;
    private readonly _messageHandlers: Map<string, ServerMessageHandler> = new Map();
    private readonly _clientJoinHandlers: ServerClientJoinHandler[] = [];
    private readonly _clientLeaveHandlers: ServerClientLeaveHandler[] = [];

    private _running: boolean = false;
    private _state: GameState;

    constructor(state: GameState) {
        this._systems.set("PRE_UPDATE", []);
        this._systems.set("UPDATE", []);
        this._systems.set("POST_UPDATE", []);

        this._state = state;
    }

    public addInterface(id: string, impl: unknown) {
        this._interfaces.set(id, impl);
    }

    public getInterface<T>(id: string): T | null {
        return (this._interfaces.get(id) as T) ?? null;
    }

    public waitForInterface<T>(id: string): Promise<T> {
        return this._interfaces.get(id) as Promise<T>;
    }

    public get running(): boolean {
        return this._running;
    }

    public setAuthHandler(handler: ServerAuthHandler) {
        this._authHandler = handler;
    }

    public onMessage(type: string, handler: ServerMessageHandler) {
        this._messageHandlers.set(type, handler);
    }

    public onClientJoin(handler: ServerClientJoinHandler) {
        this._clientJoinHandlers.push(handler);
    }

    public onClientLeave(handler: ServerClientLeaveHandler) {
        this._clientLeaveHandlers.push(handler);
    }

    public addSystem(phase: ServerSystemPhase, system: ServerSystem) {
        this._systems.get(phase)!.push(system);
    }

    public async start(port: number = 3000) {
        this._running = true;

        const runtime = this;
        const server = createColyseusServer(
            this._state,
            () => {
                for (const system of runtime._systems.get("PRE_UPDATE")!) {
                    system();
                }
    
                for (const system of runtime._systems.get("UPDATE")!) {
                    system();
                }
    
                for (const system of runtime._systems.get("POST_UPDATE")!) {
                    system();
                }
            },
            runtime._messageHandlers,
            runtime._authHandler,
            runtime._clientJoinHandlers,
            runtime._clientLeaveHandlers,
        );
        server.simulateLatency(this._simulatedLatency);
        await server.listen(port);
        await matchMaker.createRoom("game", {});
        logger.info(`Server started on port ${port}`);
    }
}