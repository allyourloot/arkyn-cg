export type ClientSystemSchedule = "FRAME" | "FIXED";

export type ClientSystemContext = {
    deltaMs: number;
    deltaSeconds: number;
    elapsedMs: number;
    elapsedSeconds: number;
    schedule: ClientSystemSchedule;
    tick: number;
};

export type ClientSystem = (context: ClientSystemContext) => void;