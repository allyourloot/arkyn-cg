import { useSyncExternalStore } from "react";
import type { VoxelWorldRendererClientInterface } from "@plugins/plugin-voxel-world-renderer/client";
import { EMPTY_HOTBAR_SLOT_VALUE, HOTBAR_SIZE, SELECT_SLOT_MESSAGE, SET_ITEM_MESSAGE } from "../shared";

type Listener = () => void;

const listeners = new Set<Listener>();
let hotbarSlots: number[] = Array.from({ length: HOTBAR_SIZE }, () => EMPTY_HOTBAR_SLOT_VALUE);
let selectedSlot = 0;
let sendFn: ((type: string, data: unknown) => void) | null = null;
const blockMetaById = new Map<number, { name: string; textureUri: string }>();
let voxelWorldRendererInterface: VoxelWorldRendererClientInterface | null = null;

export type SimpleHotbarClientInterface = {
    HOTBAR_SIZE: number;
    subscribe: (listener: Listener) => () => void;
    getHotbarSlots: () => number[];
    getSelectedSlot: () => number;
    selectHotbarSlot: (index: number) => void;
    setHotbarItem: (slot: number, blockId: number) => void;
};

export function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function notify() {
    for (const listener of listeners) {
        listener();
    }
}

export function setBlockMeta(id: number, meta: { name: string; textureUri: string }) {
    blockMetaById.set(id, meta);
}

export function getBlockMeta(blockId: number) {
    return blockMetaById.get(blockId) ?? { name: `Block ${blockId}`, textureUri: "" };
}

export function setConnection(send: (type: string, data: unknown) => void) {
    sendFn = send;
}

export function setHotbarSlots(slots: number[]) {
    hotbarSlots = slots;
    notify();
}

export function setSelectedSlot(slot: number) {
    selectedSlot = slot;
    notify();
}

export function getHotbarSlots(): number[] {
    return hotbarSlots;
}

export function getSelectedSlot(): number {
    return selectedSlot;
}

export function selectHotbarSlot(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= HOTBAR_SIZE) return;
    selectedSlot = index;
    notify();
    sendFn?.(SELECT_SLOT_MESSAGE, { slot: index });
}

export function setHotbarItem(slot: number, blockId: number) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= HOTBAR_SIZE) return;
    if (!Number.isInteger(blockId) || blockId < 0) return;
    hotbarSlots = [...hotbarSlots];
    hotbarSlots[slot] = blockId;
    notify();
    sendFn?.(SET_ITEM_MESSAGE, { slot, blockId });
}

export function useHotbarSlots(): number[] {
    return useSyncExternalStore(subscribe, getHotbarSlots);
}

export function useSelectedSlot(): number {
    return useSyncExternalStore(subscribe, getSelectedSlot);
}

export function bindVoxelWorldRendererInterface(iface: VoxelWorldRendererClientInterface) {
    voxelWorldRendererInterface = iface;
    notify();
}

export function useVoxelWorldRendererInterface() {
    return useSyncExternalStore(subscribe, () => voxelWorldRendererInterface);
}
