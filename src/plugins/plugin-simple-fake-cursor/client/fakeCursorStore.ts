import { useSyncExternalStore } from "react";

export type FakeCursorPointerEvent = {
    type: "down" | "up";
    button: number;
    x: number;
    y: number;
    pointerLocked: boolean;
    nativeEvent: MouseEvent;
};

type Listener = () => void;

const listeners = new Set<Listener>();
const pointerEventListeners = new Set<(event: FakeCursorPointerEvent) => void>();
let cursorX = Math.floor(window.innerWidth * 0.5);
let cursorY = Math.floor(window.innerHeight * 0.5);
let cursorEnabled = false;
let mousePresent = false;
let initialized = false;

export type SimpleFakeCursorClientInterface = {
    subscribe: (listener: Listener) => () => void;
    getFakeCursorPosition: () => { x: number; y: number };
    getCursorVisible: () => boolean;
    setFakeCursorVisible: (visible: boolean) => void;
    onFakeCursorPointerEvent: (listener: (event: FakeCursorPointerEvent) => void) => () => void;
};

export function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function notify() {
    for (const listener of listeners) listener();
}

function clampPosition(value: number, max: number) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(Math.floor(value), Math.max(0, Math.floor(max))));
}

export function initFakeCursor() {
    if (initialized) return;
    initialized = true;

    cursorX = Math.floor(window.innerWidth * 0.5);
    cursorY = Math.floor(window.innerHeight * 0.5);
    cursorEnabled = false;
    mousePresent = false;
    notify();

    window.addEventListener("mousemove", (event) => {
        mousePresent = true;
        if (!cursorEnabled) return;
        if (document.pointerLockElement) {
            cursorX = clampPosition(cursorX + event.movementX, window.innerWidth);
            cursorY = clampPosition(cursorY + event.movementY, window.innerHeight);
        } else {
            cursorX = clampPosition(event.clientX, window.innerWidth);
            cursorY = clampPosition(event.clientY, window.innerHeight);
        }
        notify();
    });

    window.addEventListener("mouseenter", () => {
        mousePresent = true;
        notify();
    });

    window.addEventListener("mouseleave", () => {
        mousePresent = false;
        notify();
    });

    window.addEventListener("blur", () => {
        mousePresent = false;
        notify();
    });

    window.addEventListener("resize", () => {
        cursorX = clampPosition(cursorX, window.innerWidth);
        cursorY = clampPosition(cursorY, window.innerHeight);
        notify();
    });

    window.addEventListener("mousedown", (event) => {
        emitPointerEvent("down", event);
    });

    window.addEventListener("mouseup", (event) => {
        emitPointerEvent("up", event);
    });
}

function emitPointerEvent(type: FakeCursorPointerEvent["type"], nativeEvent: MouseEvent) {
    const payload: FakeCursorPointerEvent = {
        type,
        button: nativeEvent.button,
        x: cursorX,
        y: cursorY,
        pointerLocked: Boolean(document.pointerLockElement),
        nativeEvent,
    };
    for (const listener of pointerEventListeners) listener(payload);
}

export function setFakeCursorVisible(visible: boolean) {
    if (cursorEnabled === visible) return;
    cursorEnabled = visible;
    notify();
}

export function getFakeCursorPosition() {
    return { x: cursorX, y: cursorY };
}

export function getCursorVisible() {
    return cursorEnabled && mousePresent;
}

export function onFakeCursorPointerEvent(listener: (event: FakeCursorPointerEvent) => void) {
    pointerEventListeners.add(listener);
    return () => {
        pointerEventListeners.delete(listener);
    };
}

function getCursorSnapshot() {
    return { x: cursorX, y: cursorY, visible: cursorEnabled && mousePresent };
}

let lastSnapshot = getCursorSnapshot();

function getSnapshot() {
    const next = getCursorSnapshot();
    if (next.x !== lastSnapshot.x || next.y !== lastSnapshot.y || next.visible !== lastSnapshot.visible) {
        lastSnapshot = next;
    }
    return lastSnapshot;
}

export function useFakeCursor() {
    return useSyncExternalStore(subscribe, getSnapshot);
}
