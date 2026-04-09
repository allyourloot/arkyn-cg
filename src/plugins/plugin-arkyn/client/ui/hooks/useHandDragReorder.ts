import { useEffect, useRef, useState, type RefObject, type PointerEvent as ReactPointerEvent } from "react";
import { gsap } from "gsap";
import { reorderHand, toggleRuneSelection, type RuneClientData } from "../../arkynStore";
import { playPickupRune, playDropRune } from "../../sfx";

const DRAG_THRESHOLD_PX = 6;

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
    const hasMovedRef = useRef(false);
    const startXRef = useRef(0);
    // Frozen at drag-start so transforms applied during drag don't pollute math.
    const slotCentersRef = useRef<number[]>([]);
    // Direct GSAP `quickSetter` for the dragged slot's transform x. This is
    // the fastest path GSAP offers — a synchronous setter that writes the
    // transform matrix in place on every call. `quickTo` was the wrong tool
    // here: it's designed for smooth tweening with a small duration, and
    // setting `duration: 0` has edge-case behavior where it doesn't reliably
    // commit to the DOM. `quickSetter` is the right primitive for direct,
    // high-frequency updates from pointer events.
    const draggedSetterRef = useRef<((v: number) => void) | null>(null);
    // Reference to the dragged DOM slot so we can `gsap.set(... { x: 0 })`
    // it on drop, before the React reorder commits.
    const draggedSlotElRef = useRef<HTMLElement | null>(null);

    useEffect(() => { dragInfoRef.current = dragInfo; }, [dragInfo]);
    useEffect(() => { handRef.current = hand; }, [hand]);

    // Window-level listeners. Set up once per drag-active phase. Closures read
    // live values via refs so listeners don't go stale across re-renders.
    const isDragActive = dragInfo !== null;
    useEffect(() => {
        if (!isDragActive) return;

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

        const onMove = (e: PointerEvent) => {
            const info = dragInfoRef.current;
            if (!info) return;

            const dx = e.clientX - startXRef.current;

            // Suppress noise until the user clearly intends to drag.
            if (!hasMovedRef.current && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
            if (!hasMovedRef.current) playPickupRune();
            hasMovedRef.current = true;

            // Direct 1:1 transform update for the dragged slot. Bypasses
            // React entirely so dragging is buttery smooth even on slow
            // devices — `quickSetter` writes the transform matrix in
            // place at the speed of pointer events.
            draggedSetterRef.current?.(dx);

            // Only re-render React when the preview index changes (i.e.
            // when the dragged card crosses a slot boundary). The non-
            // dragged slots' slide-aside is the only thing that depends
            // on render output, and it's gated on previewIdx in
            // HandDisplay's useGSAP hook.
            const newPreviewIdx = indexAtClientX(e.clientX);
            if (info.previewIdx === newPreviewIdx) return;

            const next: DragInfo = { ...info, previewIdx: newPreviewIdx };
            dragInfoRef.current = next;
            setDragInfo(next);
        };

        const onUp = (e: PointerEvent) => {
            const info = dragInfoRef.current;
            const wasMoved = hasMovedRef.current;
            const draggedSlot = draggedSlotElRef.current;

            // Zero out the dragged slot's transform BEFORE the React
            // reorder commits. The slot's component instance survives the
            // reorder (key={rune.id}), so a stale x value would otherwise
            // drift the rune to the wrong position post-reorder.
            if (draggedSlot) {
                gsap.set(draggedSlot, { x: 0 });
            }

            // Reset refs first so listener teardown happens cleanly.
            dragInfoRef.current = null;
            hasMovedRef.current = false;
            draggedSetterRef.current = null;
            draggedSlotElRef.current = null;
            setDragInfo(null);

            if (!info) return;

            if (wasMoved) {
                playDropRune();
                if (info.previewIdx !== info.originalIdx) {
                    reorderHand(info.originalIdx, info.previewIdx);
                }
            } else {
                // No drag → treat as a tap, toggle selection.
                const currentHand = handRef.current;
                const idx = currentHand.findIndex(r => r.id === info.runeId);
                if (idx >= 0) toggleRuneSelection(idx);
            }

            // Suppress the synthetic click that follows.
            e.preventDefault();
        };

        const onCancel = () => {
            const draggedSlot = draggedSlotElRef.current;
            if (draggedSlot) {
                gsap.set(draggedSlot, { x: 0 });
            }
            dragInfoRef.current = null;
            hasMovedRef.current = false;
            draggedSetterRef.current = null;
            draggedSlotElRef.current = null;
            setDragInfo(null);
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onCancel);
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onCancel);
        };
    }, [isDragActive]);

    const onSlotPointerDown = (
        e: ReactPointerEvent<HTMLDivElement>,
        runeId: string,
        idx: number,
    ) => {
        if (animating) return;
        if (e.button !== 0) return;
        // Block native HTML5 image drag from hijacking the gesture.
        e.preventDefault();

        // Snapshot slot centers + stride at drag start. We use frozen
        // positions because applied transforms during drag would otherwise
        // make getBoundingClientRect() report shifted positions.
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

        // Bind a `quickSetter` to the dragged slot so onMove can update
        // its transform x with zero React involvement. quickSetter is the
        // synchronous direct-write primitive — every call writes the matrix
        // immediately, no tween machinery, no scheduling.
        if (draggedSlot) {
            draggedSlotElRef.current = draggedSlot;
            draggedSetterRef.current = gsap.quickSetter(draggedSlot, "x", "px") as (v: number) => void;
        }

        startXRef.current = e.clientX;
        hasMovedRef.current = false;
        const info: DragInfo = {
            runeId,
            originalIdx: idx,
            previewIdx: idx,
            cardStride,
        };
        dragInfoRef.current = info;
        setDragInfo(info);
    };

    return { dragInfo, onSlotPointerDown };
}
