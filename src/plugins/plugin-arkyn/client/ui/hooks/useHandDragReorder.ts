import { useRef, useState, type RefObject, type PointerEvent as ReactPointerEvent } from "react";
import { gsap } from "gsap";
import { reorderHand, toggleRuneSelection, type RuneClientData } from "../../arkynStore";
import { playPickupRune, playDropRune } from "../../sfx";

const DRAG_THRESHOLD_PX = 6;
/** Pointer must be held for at least this long before drag can engage. */
const DRAG_HOLD_MS = 150;

export interface DragInfo {
    runeId: string;
    originalIdx: number;
    previewIdx: number;
    /**
     * Distance between two adjacent card centers, captured at drag start.
     * Used by the consumer to slide non-dragged cards aside while drag is
     * in progress. Frozen so transforms applied during the drag don't
     * pollute the math.
     */
    cardStride: number;
}

interface UseHandDragReorderOptions {
    /** Current hand — used to look up the live display index of the dragged rune on tap. */
    hand: readonly RuneClientData[];
    /** Container element holding the hand slots; used to query slot centers at drag start. */
    containerRef: RefObject<HTMLElement | null>;
    /** When true, drag is suppressed (e.g. during a cast or discard animation). */
    animating: boolean;
}

export interface UseHandDragReorderResult {
    /** Current drag state, or null when no drag is in progress. */
    dragInfo: DragInfo | null;
    /** Pointer-down handler to attach to each rune slot. */
    onSlotPointerDown: (
        e: ReactPointerEvent<HTMLDivElement>,
        runeId: string,
        idx: number,
    ) => void;
}

/**
 * Drag-to-reorder behavior for the hand of runes. Encapsulates pointer
 * tracking, the move-vs-tap distinction, slot-center math, and the global
 * pointermove/pointerup/pointercancel listeners. Calls `reorderHand` on a
 * successful drop and `toggleRuneSelection` on a tap.
 *
 * Returns the live drag state (so the consumer can compute per-card
 * transforms) and the handler to attach to each slot.
 */
export function useHandDragReorder({
    hand,
    containerRef,
    animating,
}: UseHandDragReorderOptions): UseHandDragReorderResult {
    const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);

    const dragInfoRef = useRef<DragInfo | null>(null);
    const handRef = useRef(hand);
    handRef.current = hand;
    const hasMovedRef = useRef(false);
    const startXRef = useRef(0);
    // Frozen at drag-start so transforms applied during drag don't pollute math.
    const slotCentersRef = useRef<number[]>([]);
    // Direct GSAP `quickSetter` for the dragged slot's transform x. This is
    // the fastest path GSAP offers — a synchronous setter that writes the
    // transform matrix in place on every call.
    const draggedSetterRef = useRef<((v: number) => void) | null>(null);
    // Reference to the dragged DOM slot so we can `gsap.set(... { x: 0 })`
    // it on drop, before the React reorder commits.
    const draggedSlotElRef = useRef<HTMLElement | null>(null);
    // Cleanup function for the synchronous window listeners. Stored so
    // onPointerDown can be called again safely without leaking listeners.
    const cleanupRef = useRef<(() => void) | null>(null);
    // Timestamp of the pointer-down event. Drag only engages if the pointer
    // has been held for at least DRAG_HOLD_MS.
    const downTimeRef = useRef(0);
    // The pending drag info before threshold is crossed. Not exposed to
    // React state until the drag threshold is actually reached.
    const pendingInfoRef = useRef<DragInfo | null>(null);

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
        runeId: string,
        idx: number,
    ) => {
        if (animating) return;
        if (e.button !== 0) return;
        // Block native HTML5 image drag from hijacking the gesture.
        e.preventDefault();

        // Clean up any stale listeners from a previous gesture.
        teardownListeners();

        // Snapshot slot centers + stride at pointer-down.
        let cardStride = 56; // sensible default if we can't measure
        const container = containerRef.current;
        let draggedSlot: HTMLElement | null = null;
        if (container) {
            const slots = container.querySelectorAll<HTMLElement>("[data-rune-index]");
            const centers: number[] = [];
            slots.forEach(slot => {
                const rect = slot.getBoundingClientRect();
                centers.push(rect.left + rect.width / 2);
                if (slot.getAttribute("data-rune-id") === runeId) {
                    draggedSlot = slot;
                }
            });
            slotCentersRef.current = centers;
            if (centers.length >= 2) {
                cardStride = centers[1] - centers[0];
            }
        }

        if (draggedSlot) {
            draggedSlotElRef.current = draggedSlot;
            draggedSetterRef.current = gsap.quickSetter(draggedSlot, "x", "px") as (v: number) => void;
        }

        startXRef.current = e.clientX;
        downTimeRef.current = performance.now();
        hasMovedRef.current = false;

        // Store pending info in a ref — React state is NOT set yet. We
        // only promote to real dragInfo once the drag threshold is crossed,
        // so quick taps never enter drag mode.
        const info: DragInfo = {
            runeId,
            originalIdx: idx,
            previewIdx: idx,
            cardStride,
        };
        pendingInfoRef.current = info;

        // Attach window listeners synchronously so there's no race between
        // a fast pointerup and React's async useEffect scheduling.
        const onMove = (ev: PointerEvent) => {
            const pending = pendingInfoRef.current;
            const active = dragInfoRef.current;
            const info = active || pending;
            if (!info) return;

            const dx = ev.clientX - startXRef.current;

            // Suppress noise until the user clearly intends to drag.
            // Both the distance threshold AND the hold-time gate must pass.
            if (!hasMovedRef.current && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
            if (!hasMovedRef.current && (performance.now() - downTimeRef.current) < DRAG_HOLD_MS) return;

            // Threshold just crossed — promote to real drag state.
            if (!hasMovedRef.current) {
                hasMovedRef.current = true;
                playPickupRune();
                dragInfoRef.current = info;
                pendingInfoRef.current = null;
                setDragInfo(info);
            }

            // Direct 1:1 transform update for the dragged slot.
            draggedSetterRef.current?.(dx);

            // Only re-render React when the preview index changes.
            const newPreviewIdx = indexAtClientX(ev.clientX);
            if (dragInfoRef.current!.previewIdx === newPreviewIdx) return;

            const next: DragInfo = { ...dragInfoRef.current!, previewIdx: newPreviewIdx };
            dragInfoRef.current = next;
            setDragInfo(next);
        };

        const onUp = (ev: PointerEvent) => {
            teardownListeners();

            const wasMoved = hasMovedRef.current;
            const draggedSlot = draggedSlotElRef.current;

            // Zero out the dragged slot's transform BEFORE the React
            // reorder commits.
            if (draggedSlot) {
                gsap.set(draggedSlot, { x: 0 });
            }

            const activeInfo = dragInfoRef.current;
            const pendingInfo = pendingInfoRef.current;

            resetDragState();

            if (wasMoved && activeInfo) {
                playDropRune();
                if (activeInfo.previewIdx !== activeInfo.originalIdx) {
                    reorderHand(activeInfo.originalIdx, activeInfo.previewIdx);
                }
            } else {
                // No drag → treat as a tap, toggle selection.
                const targetId = activeInfo?.runeId ?? pendingInfo?.runeId;
                if (targetId) {
                    const currentHand = handRef.current;
                    const idx = currentHand.findIndex(r => r.id === targetId);
                    if (idx >= 0) toggleRuneSelection(idx);
                }
            }

            // Suppress the synthetic click that follows.
            ev.preventDefault();
        };

        const onCancel = () => {
            teardownListeners();
            const draggedSlot = draggedSlotElRef.current;
            if (draggedSlot) {
                gsap.set(draggedSlot, { x: 0 });
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
