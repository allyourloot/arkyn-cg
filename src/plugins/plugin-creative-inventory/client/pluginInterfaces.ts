import { useSyncExternalStore } from "react";
import type {
    FakeCursorPointerEvent,
    SimpleFakeCursorClientInterface,
} from "@plugins/plugin-simple-fake-cursor/client";
import type { VoxelWorldRendererClientInterface } from "@plugins/plugin-voxel-world-renderer/client";

type Listener = () => void;

const cursorListeners = new Set<Listener>();
function cursorSubscribe(listener: Listener) {
    cursorListeners.add(listener);
    return () => {
        cursorListeners.delete(listener);
    };
}
function cursorNotify() {
    for (const listener of cursorListeners) listener();
}

let cursorInterface: SimpleFakeCursorClientInterface | null = null;
let cursorSnapshot = { x: 0, y: 0, visible: false };

function getCursorSnapshot() {
    if (!cursorInterface) return cursorSnapshot;

    const pos = cursorInterface.getFakeCursorPosition();
    const visible = cursorInterface.getCursorVisible();
    if (pos.x !== cursorSnapshot.x || pos.y !== cursorSnapshot.y || visible !== cursorSnapshot.visible) {
        cursorSnapshot = { x: pos.x, y: pos.y, visible };
    }
    return cursorSnapshot;
}

export function bindFakeCursorInterface(iface: SimpleFakeCursorClientInterface) {
    cursorInterface = iface;
    iface.subscribe(() => cursorNotify());
    cursorNotify();
}

export function getFakeCursorPosition() {
    return cursorInterface?.getFakeCursorPosition() ?? { x: 0, y: 0 };
}

export function setFakeCursorVisible(visible: boolean) {
    cursorInterface?.setFakeCursorVisible(visible);
}

export function onFakeCursorPointerEvent(listener: (event: FakeCursorPointerEvent) => void) {
    if (!cursorInterface) return () => {};
    return cursorInterface.onFakeCursorPointerEvent(listener);
}

export function useFakeCursor() {
    return useSyncExternalStore(cursorSubscribe, getCursorSnapshot);
}

type HotbarInterface = {
    HOTBAR_SIZE: number;
    subscribe: (listener: Listener) => () => void;
    getHotbarSlots: () => number[];
    getSelectedSlot: () => number;
    selectHotbarSlot: (index: number) => void;
    setHotbarItem: (slot: number, blockId: number) => void;
};

const hotbarListeners = new Set<Listener>();
function hotbarSubscribe(listener: Listener) {
    hotbarListeners.add(listener);
    return () => {
        hotbarListeners.delete(listener);
    };
}
function hotbarNotify() {
    for (const listener of hotbarListeners) listener();
}

let hotbarInterface: HotbarInterface | null = null;
const emptySlots: number[] = [];

export function bindHotbarInterface(iface: HotbarInterface) {
    hotbarInterface = iface;
    iface.subscribe(() => hotbarNotify());
    hotbarNotify();
}

export function getHotbarSize() {
    return hotbarInterface?.HOTBAR_SIZE ?? 9;
}

export function selectHotbarSlot(index: number) {
    hotbarInterface?.selectHotbarSlot(index);
}

export function setHotbarItem(slot: number, blockId: number) {
    hotbarInterface?.setHotbarItem(slot, blockId);
}

export function useHotbarSlots(): number[] {
    return useSyncExternalStore(hotbarSubscribe, () => hotbarInterface?.getHotbarSlots() ?? emptySlots);
}

export function useSelectedSlot(): number {
    return useSyncExternalStore(hotbarSubscribe, () => hotbarInterface?.getSelectedSlot() ?? 0);
}

const voxelWorldRendererListeners = new Set<Listener>();
function voxelWorldRendererSubscribe(listener: Listener) {
    voxelWorldRendererListeners.add(listener);
    return () => {
        voxelWorldRendererListeners.delete(listener);
    };
}
function voxelWorldRendererNotify() {
    for (const listener of voxelWorldRendererListeners) listener();
}

let voxelWorldRendererInterface: VoxelWorldRendererClientInterface | null = null;

export function bindVoxelWorldRendererInterface(iface: VoxelWorldRendererClientInterface) {
    voxelWorldRendererInterface = iface;
    voxelWorldRendererNotify();
}

export function useVoxelWorldRendererInterface() {
    return useSyncExternalStore(
        voxelWorldRendererSubscribe,
        () => voxelWorldRendererInterface,
    );
}
