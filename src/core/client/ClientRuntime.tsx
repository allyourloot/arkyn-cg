import { createRoot } from "react-dom/client";
import type { ClientSystemContext } from "./ClientSystem";
import type { ClientSystemPhase } from "./ClientSystemPhase";
import type { ClientSystem } from "./ClientSystem";
import type { Connection } from "./Connection";

const FIXED_TIMESTEP_MS = 1000 / 60;
const MAX_FIXED_STEPS_PER_FRAME = 5;
const MAX_FRAME_DELTA_MS = 250;

export class ClientRuntime {
    private readonly _connection: Connection;
    private readonly _overlays: React.ReactNode[] = [];
    private readonly _systems: Map<ClientSystemPhase, ClientSystem[]> = new Map();
    private readonly _interfaces: Map<string, unknown> = new Map();
    private _frameTick: number = 0;
    private _fixedTick: number = 0;
    private _elapsedMs: number = 0;
    private _fixedElapsedMs: number = 0;
    private _lastFrameAtMs: number | null = null;
    private _fixedAccumulatorMs: number = 0;

    constructor(connection: Connection) {
        this._connection = connection;
        
        this._systems.set("PRE_UPDATE", []);
        this._systems.set("UPDATE", []);
        this._systems.set("POST_UPDATE", []);
        this._systems.set("PRE_FIXED_UPDATE", []);
        this._systems.set("FIXED_UPDATE", []);
        this._systems.set("POST_FIXED_UPDATE", []);
    }

    public addOverlay(overlay: React.ReactNode) {
        this._overlays.push(overlay);
    }

    public addSystem(phase: ClientSystemPhase, system: ClientSystem) {
        this._systems.get(phase)!.push(system);
    }

    public addInterface(id: string, impl: unknown) {
        if (this._interfaces.has(id))
            throw new Error(`Interface ${id} already registered`);

        this._interfaces.set(id, impl);
    }

    public getInterface<T>(id: string): T | null {
        return this._interfaces.get(id) as T | null;
    }
    
    public sendMessage(type: string, data: unknown) {
        this._connection.room?.send(type, data);
    }

    public async start(uiRootElementId: string = "root") {
        const root = document.getElementById(uiRootElementId);
        if (!root)
            throw new Error("Root element not found");

        createRoot(root)
            .render(
                <>
                    {this._overlays.map((overlay, index) => (
                        <div key={index} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>{overlay}</div>
                    ))}
                </>
            );
        
        requestAnimationFrame(this._onFrameCallback.bind(this));
    }

    private _runPhase(phase: ClientSystemPhase, context: ClientSystemContext) {
        for (const system of this._systems.get(phase)!) {
            system(context);
        }
    }

    private _onFrameCallback(timestampMs: number) {
        if (this._lastFrameAtMs === null) {
            this._lastFrameAtMs = timestampMs;
        }

        const frameDeltaMs = Math.min(timestampMs - this._lastFrameAtMs, MAX_FRAME_DELTA_MS);
        this._lastFrameAtMs = timestampMs;
        this._elapsedMs += frameDeltaMs;
        this._frameTick += 1;

        const frameContext: ClientSystemContext = {
            deltaMs: frameDeltaMs,
            deltaSeconds: frameDeltaMs / 1000,
            elapsedMs: this._elapsedMs,
            elapsedSeconds: this._elapsedMs / 1000,
            schedule: "FRAME",
            tick: this._frameTick,
        };
        this._runPhase("PRE_UPDATE", frameContext);
        this._runPhase("UPDATE", frameContext);
        this._runPhase("POST_UPDATE", frameContext);

        this._fixedAccumulatorMs += frameDeltaMs;
        let fixedSteps = 0;

        while (
            this._fixedAccumulatorMs >= FIXED_TIMESTEP_MS
            && fixedSteps < MAX_FIXED_STEPS_PER_FRAME
        ) {
            this._fixedAccumulatorMs -= FIXED_TIMESTEP_MS;
            this._fixedElapsedMs += FIXED_TIMESTEP_MS;
            this._fixedTick += 1;
            fixedSteps += 1;

            const fixedContext: ClientSystemContext = {
                deltaMs: FIXED_TIMESTEP_MS,
                deltaSeconds: FIXED_TIMESTEP_MS / 1000,
                elapsedMs: this._fixedElapsedMs,
                elapsedSeconds: this._fixedElapsedMs / 1000,
                schedule: "FIXED",
                tick: this._fixedTick,
            };
            this._runPhase("PRE_FIXED_UPDATE", fixedContext);
            this._runPhase("FIXED_UPDATE", fixedContext);
            this._runPhase("POST_FIXED_UPDATE", fixedContext);
        }

        if (fixedSteps === MAX_FIXED_STEPS_PER_FRAME && this._fixedAccumulatorMs >= FIXED_TIMESTEP_MS) {
            // Prevent unbounded catch-up loops when a tab stalls for too long.
            this._fixedAccumulatorMs = 0;
        }

        requestAnimationFrame(this._onFrameCallback.bind(this));
    }
}