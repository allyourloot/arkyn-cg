import { useSyncExternalStore } from "react";
import { HOTBAR_SET_ITEM_MESSAGE } from "../shared";

type Listener = () => void;

const listeners = new Set<Listener>();
let blockIds: number[] = [];
let isOpen = false;
let isDragging = false;
let dragBlockId = 0;
let sendFn: ((type: string, data: unknown) => void) | null = null;
const blockMetaById = new Map<number, { name: string; textureUri: string }>();

function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function notify() {
    for (const listener of listeners) listener();
}

export function setConnection(send: (type: string, data: unknown) => void) {
    sendFn = send;
}

export function setBlockIds(ids: number[]) {
    blockIds = ids;
    notify();
}

export function setBlockMeta(id: number, meta: { name: string; textureUri: string }) {
    blockMetaById.set(id, meta);
}

export function getBlockMeta(blockId: number) {
    return blockMetaById.get(blockId) ?? { name: `Block ${blockId}`, textureUri: "" };
}

export function setInventoryOpen(open: boolean) {
    isOpen = open;
    if (!open) stopInventoryBlockDrag();
    notify();
}

export function toggleInventory() {
    setInventoryOpen(!isOpen);
}

export function startInventoryBlockDrag(blockId: number) {
    if (!Number.isInteger(blockId) || blockId <= 0) return;
    isDragging = true;
    dragBlockId = blockId;
    notify();
}

export function stopInventoryBlockDrag() {
    isDragging = false;
    dragBlockId = 0;
    notify();
}

export function sendSetHotbarItem(slot: number, blockId: number) {
    sendFn?.(HOTBAR_SET_ITEM_MESSAGE, { slot, blockId });
}

function getSnapshot() {
    return { blockIds, isOpen, isDragging, dragBlockId };
}

let lastSnapshot = getSnapshot();

function getStableSnapshot() {
    const next = getSnapshot();
    if (
        next.blockIds !== lastSnapshot.blockIds ||
        next.isOpen !== lastSnapshot.isOpen ||
        next.isDragging !== lastSnapshot.isDragging ||
        next.dragBlockId !== lastSnapshot.dragBlockId
    ) {
        lastSnapshot = next;
    }
    return lastSnapshot;
}

export function useInventoryStore() {
    return useSyncExternalStore(subscribe, getStableSnapshot);
}
