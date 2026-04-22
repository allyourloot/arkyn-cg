import { useRef, useState, type RefObject, type PointerEvent as ReactPointerEvent } from "react";
import { gsap } from "gsap";
import { sendReorderSigils } from "../../arkynStore";
import { playPickupRune, playDropRune } from "../../sfx";

const DRAG_THRESHOLD_PX = 6;
/** Pointer must be held for at least this long before drag can engage. */
const DRAG_HOLD_MS = 150;

export interface SigilDragInfo {
    sigilId: string;
    originalIdx: number;
    previewIdx: number;
    /** Distance between adjacent sigil slot centers, frozen at drag start. */
    slotStride: number;
}

interface UseSigilDragReorderOptions {
    /** Current owned sigils (ids). */
    sigils: readonly string[];
    /** Container element holding the sigil slots. */
    containerRef: RefObject<HTMLElement | null>;
    /** Tap callback — fires when the pointer gesture is a tap, not a drag. */
    onTap: (sigilId: string) => void;
}

export interface UseSigilDragReorderResult {
    dragInfo: SigilDragInfo | null;
    onSlotPointerDown: (
        e: ReactPointerEvent<HTMLDivElement>,
        sigilId: string,
        idx: number,
    ) => void;
}

/**
 * Drag-to-reorder behavior for the sigil bar. Mirrors `useHandDragReorder`
 * but dispatches `sendReorderSigils` on drop (server is authoritative for
 * sigil order) and delegates tap to an external handler (the sigil bar uses
 * tap to toggle the sell-button overlay, which is different behavior from
 * the hand's "toggle selection" tap).
 */
export function useSigilDragReorder({
    sigils,
    containerRef,
    onTap,
}: UseSigilDragReorderOptions): UseSigilDragReorderResult {
    const [dragInfo, setDragInfo] = useState<SigilDragInfo | null>(null);

    const dragInfoRef = useRef<SigilDragInfo | null>(null);
    const sigilsRef = useRef(sigils);
    sigilsRef.current = sigils;
    const hasMovedRef = useRef(false);
    const startXRef = useRef(0);
    const slotCentersRef = useRef<number[]>([]);
    const draggedSetterRef = useRef<((v: number) => void) | null>(null);
    const draggedSlotElRef = useRef<HTMLElement | null>(null);
    const cleanupRef = useRef<(() => void) | null>(null);
    const downTimeRef = useRef(0);
    const pendingInfoRef = useRef<SigilDragInfo | null>(null);

    const indexAtClientX = (clientX: number): number => {
        const centers = slotCentersRef.current;
        if (centers.length === 0) return 0;
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < centers.length; i++) {
            const dist = Math.abs(clientX - centers[i]);
            if (dist < bestDist) {
                bestDist = dist;
                bestIdx = i;
            }
        }
        return bestIdx;
    };

    const teardownListeners = () => {
        if (cleanupRef.current) {
            cleanupRef.current();
            cleanupRef.current = null;
        }
    };

    const resetDragState = () => {
        dragInfoRef.current = null;
        pendingInfoRef.current = null;
        hasMovedRef.current = false;
        draggedSetterRef.current = null;
        draggedSlotElRef.current = null;
        setDragInfo(null);
    };

    const onSlotPointerDown = (
        e: ReactPointerEvent<HTMLDivElement>,
        sigilId: string,
        idx: number,
    ) => {
        if (e.button !== 0) return;
        e.preventDefault();

        teardownListeners();

        let slotStride = 80;
        const container = containerRef.current;
        let draggedSlot: HTMLElement | null = null;
        if (container) {
            const slots = container.querySelectorAll<HTMLElement>("[data-sigil-index]");
            const centers: number[] = [];
            slots.forEach(slot => {
                const rect = slot.getBoundingClientRect();
                centers.push(rect.left + rect.width / 2);
                if (slot.getAttribute("data-sigil-id") === sigilId) {
                    draggedSlot = slot;
                }
            });
            slotCentersRef.current = centers;
            if (centers.length >= 2) {
                slotStride = centers[1] - centers[0];
            }
        }

        if (draggedSlot) {
            draggedSlotElRef.current = draggedSlot;
            draggedSetterRef.current = gsap.quickSetter(draggedSlot, "x", "px") as (v: number) => void;
        }

        startXRef.current = e.clientX;
        downTimeRef.current = performance.now();
        hasMovedRef.current = false;

        const info: SigilDragInfo = {
            sigilId,
            originalIdx: idx,
            previewIdx: idx,
            slotStride,
        };
        pendingInfoRef.current = info;

        const onMove = (ev: PointerEvent) => {
            const pending = pendingInfoRef.current;
            const active = dragInfoRef.current;
            const live = active || pending;
            if (!live) return;

            const dx = ev.clientX - startXRef.current;

            if (!hasMovedRef.current && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
            if (!hasMovedRef.current && (performance.now() - downTimeRef.current) < DRAG_HOLD_MS) return;

            if (!hasMovedRef.current) {
                hasMovedRef.current = true;
                playPickupRune();
                dragInfoRef.current = live;
                pendingInfoRef.current = null;
                setDragInfo(live);
            }

            draggedSetterRef.current?.(dx);

            const newPreviewIdx = indexAtClientX(ev.clientX);
            if (dragInfoRef.current!.previewIdx === newPreviewIdx) return;

            const next: SigilDragInfo = { ...dragInfoRef.current!, previewIdx: newPreviewIdx };
            dragInfoRef.current = next;
            setDragInfo(next);
        };

        const onUp = (ev: PointerEvent) => {
            teardownListeners();

            const wasMoved = hasMovedRef.current;
            const draggedSlotEl = draggedSlotElRef.current;

            if (draggedSlotEl) {
                gsap.set(draggedSlotEl, { x: 0 });
            }

            const activeInfo = dragInfoRef.current;
            const pendingInfo = pendingInfoRef.current;

            resetDragState();

            if (wasMoved && activeInfo) {
                playDropRune();
                if (activeInfo.previewIdx !== activeInfo.originalIdx) {
                    sendReorderSigils(activeInfo.originalIdx, activeInfo.previewIdx);
                }
            } else {
                const targetId = activeInfo?.sigilId ?? pendingInfo?.sigilId;
                if (targetId) onTap(targetId);
            }

            ev.preventDefault();
        };

        const onCancel = () => {
            teardownListeners();
            const draggedSlotEl = draggedSlotElRef.current;
            if (draggedSlotEl) {
                gsap.set(draggedSlotEl, { x: 0 });
            }
            resetDragState();
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onCancel);
        cleanupRef.current = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onCancel);
        };
    };

    return { dragInfo, onSlotPointerDown };
}
