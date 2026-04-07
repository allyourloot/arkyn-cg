import { useSyncExternalStore } from "react";

export type ScreenNameplate = {
    sessionId: string;
    username: string;
    x: number;
    y: number;
};

type Listener = () => void;

const listeners = new Set<Listener>();
let nameplates: ScreenNameplate[] = [];

export function subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function notify() {
    for (const listener of listeners) {
        listener();
    }
}

export function setNameplates(next: ScreenNameplate[]) {
    nameplates = next;
    notify();
}

function getSnapshot() {
    return nameplates;
}

export function useNameplates() {
    return useSyncExternalStore(subscribe, getSnapshot);
}
