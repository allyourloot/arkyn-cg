import type { Group } from "three";

export type SimplePlayerRendererInterface = {
    getRemotePlayerObject(sessionId: string): Group | null;
    getRemotePlayerObjects(): Iterable<[string, Group]>;
};
