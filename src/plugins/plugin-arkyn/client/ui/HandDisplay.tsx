import { useEffect, useRef, useState } from "react";
import {
    useHand,
    useSelectedIndices,
    useIsCastAnimating,
    useIsDiscardAnimating,
    useDrawingRuneIds,
    toggleRuneSelection,
    reorderHand,
} from "../arkynStore";
import RuneCard from "./RuneCard";
import styles from "./HandDisplay.module.css";

const DRAG_THRESHOLD_PX = 6;

interface DragInfo {
    runeId: string;
    originalIdx: number;
    offsetX: number;
    previewIdx: number;
}

export default function HandDisplay() {
    const hand = useHand();
    const selectedIndices = useSelectedIndices();
    const isCastAnimating = useIsCastAnimating();
    const isDiscardAnimating = useIsDiscardAnimating();
    const drawingRuneIds = useDrawingRuneIds();

    const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const dragInfoRef = useRef<DragInfo | null>(null);
    const handRef = useRef(hand);
    const hasMovedRef = useRef(false);
    const startXRef = useRef(0);
    // Frozen at drag-start so transforms applied during drag don't pollute math.
    const slotCentersRef = useRef<number[]>([]);
    const cardStrideRef = useRef(56);

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
            hasMovedRef.current = true;

            const newPreviewIdx = indexAtClientX(e.clientX);
            if (info.offsetX === dx && info.previewIdx === newPreviewIdx) return;

            const next: DragInfo = { ...info, offsetX: dx, previewIdx: newPreviewIdx };
            dragInfoRef.current = next;
            setDragInfo(next);
        };

        const onUp = (e: PointerEvent) => {
            const info = dragInfoRef.current;
            const wasMoved = hasMovedRef.current;

            // Reset state first so listener teardown happens cleanly.
            dragInfoRef.current = null;
            hasMovedRef.current = false;
            setDragInfo(null);

            if (!info) return;

            if (wasMoved) {
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
            dragInfoRef.current = null;
            hasMovedRef.current = false;
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

    if (hand.length === 0) return null;

    // Fan layout: compute rotation per card for a natural hand feel
    const totalCards = hand.length;
    const maxFanAngle = 20;
    const angleStep = totalCards > 1 ? maxFanAngle / (totalCards - 1) : 0;
    const startAngle = -maxFanAngle / 2;

    const animating = isCastAnimating || isDiscardAnimating;

    const onSlotPointerDown = (
        e: React.PointerEvent<HTMLDivElement>,
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
        const container = containerRef.current;
        if (container) {
            const slots = container.querySelectorAll<HTMLElement>("[data-rune-index]");
            const centers: number[] = [];
            slots.forEach(slot => {
                const rect = slot.getBoundingClientRect();
                centers.push(rect.left + rect.width / 2);
            });
            slotCentersRef.current = centers;
            if (centers.length >= 2) {
                cardStrideRef.current = centers[1] - centers[0];
            }
        }

        startXRef.current = e.clientX;
        hasMovedRef.current = false;
        const info: DragInfo = {
            runeId,
            originalIdx: idx,
            offsetX: 0,
            previewIdx: idx,
        };
        dragInfoRef.current = info;
        setDragInfo(info);
    };

    return (
        <div ref={containerRef} className={styles.hand}>
            {hand.map((rune, index) => {
                const rotation = totalCards > 1 ? startAngle + angleStep * index : 0;
                const isSelected = selectedIndices.includes(index);
                const isHiddenForCast = animating && isSelected;
                const isDrawingIn = drawingRuneIds.includes(rune.id);
                const isHidden = isHiddenForCast || isDrawingIn;
                const isDragging = dragInfo !== null && dragInfo.runeId === rune.id;

                const slotStyle: React.CSSProperties = {
                    zIndex: isDragging ? 200 : isSelected ? 100 : index,
                };

                // Drag visuals: dragged card follows the cursor; the cards
                // between the original and preview positions slide aside.
                if (dragInfo !== null) {
                    const stride = cardStrideRef.current;
                    if (isDragging) {
                        slotStyle.transform = `translateX(${dragInfo.offsetX}px)`;
                    } else {
                        const { originalIdx, previewIdx } = dragInfo;
                        if (originalIdx < previewIdx && index > originalIdx && index <= previewIdx) {
                            slotStyle.transform = `translateX(${-stride}px)`;
                        } else if (originalIdx > previewIdx && index < originalIdx && index >= previewIdx) {
                            slotStyle.transform = `translateX(${stride}px)`;
                        }
                    }
                }

                return (
                    <div
                        key={rune.id}
                        data-rune-index={index}
                        className={`${styles.cardSlot} ${isHidden ? styles.hidden : ""} ${isDragging ? styles.dragging : ""}`}
                        style={slotStyle}
                        onPointerDown={(e) => onSlotPointerDown(e, rune.id, index)}
                        onDragStart={(e) => e.preventDefault()}
                    >
                        <RuneCard
                            rune={rune}
                            isSelected={isSelected}
                            index={index}
                            // Selection happens in the pointerup handler so it
                            // doesn't fire mid-drag. No-op here.
                            onClick={() => { /* handled in pointerup */ }}
                            rotation={rotation}
                        />
                    </div>
                );
            })}
        </div>
    );
}
