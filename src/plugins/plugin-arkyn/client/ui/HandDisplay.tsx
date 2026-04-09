import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
    useHand,
    useSelectedIndices,
    useIsCastAnimating,
    useIsDiscardAnimating,
    useDrawingRuneIds,
} from "../arkynStore";
import RuneCard from "./RuneCard";
import { useHandDragReorder } from "./hooks/useHandDragReorder";
import styles from "./HandDisplay.module.css";

export default function HandDisplay() {
    const hand = useHand();
    const selectedIndices = useSelectedIndices();
    const isCastAnimating = useIsCastAnimating();
    const isDiscardAnimating = useIsDiscardAnimating();
    const drawingRuneIds = useDrawingRuneIds();

    const containerRef = useRef<HTMLDivElement>(null);
    const animating = isCastAnimating || isDiscardAnimating;

    const { dragInfo, onSlotPointerDown } = useHandDragReorder({
        hand,
        containerRef,
        animating,
    });

    // Slide-aside animation for non-dragged slots while a drag is in
    // progress. Driven by GSAP `gsap.to` with `overwrite: 'auto'` so the
    // slots can retarget cleanly as the preview index changes (e.g. while
    // the user drags the card across the row). Re-runs only when the
    // preview index, original index, or runeId changes — NOT on every
    // pointermove (the dragged card itself is driven directly by quickTo
    // inside useHandDragReorder, no React re-render involved).
    useGSAP(() => {
        const container = containerRef.current;
        if (!container) return;
        const slots = container.querySelectorAll<HTMLElement>("[data-rune-index]");
        if (!dragInfo) {
            // No drag — reset every slot to x=0.
            gsap.to(slots, { x: 0, duration: 0.18, ease: "power2.out", overwrite: "auto" });
            return;
        }
        const stride = dragInfo.cardStride;
        const { originalIdx, previewIdx, runeId } = dragInfo;
        slots.forEach((slot, index) => {
            // Skip the dragged slot — quickTo in useHandDragReorder owns it.
            if (slot.getAttribute("data-rune-id") === runeId) return;
            let targetX = 0;
            if (originalIdx < previewIdx && index > originalIdx && index <= previewIdx) {
                targetX = -stride;
            } else if (originalIdx > previewIdx && index < originalIdx && index >= previewIdx) {
                targetX = stride;
            }
            gsap.to(slot, { x: targetX, duration: 0.18, ease: "power2.out", overwrite: "auto" });
        });
    }, {
        dependencies: [dragInfo?.previewIdx, dragInfo?.originalIdx, dragInfo?.runeId],
        scope: containerRef,
    });

    if (hand.length === 0) return null;

    // Fan layout: compute rotation per card for a natural hand feel
    const totalCards = hand.length;
    const maxFanAngle = 20;
    const angleStep = totalCards > 1 ? maxFanAngle / (totalCards - 1) : 0;
    const startAngle = -maxFanAngle / 2;

    return (
        <div ref={containerRef} className={styles.hand}>
            {hand.map((rune, index) => {
                const rotation = totalCards > 1 ? startAngle + angleStep * index : 0;
                const isSelected = selectedIndices.includes(index);
                const isHiddenForCast = animating && isSelected;
                const isDrawingIn = drawingRuneIds.includes(rune.id);
                const isHidden = isHiddenForCast || isDrawingIn;
                const isDragging = dragInfo !== null && dragInfo.runeId === rune.id;

                // Slot transform x is GSAP-driven (see useGSAP above and
                // the quickTo follow inside useHandDragReorder). Only
                // zIndex is React-controlled here.
                const slotStyle: React.CSSProperties = {
                    zIndex: isDragging ? 200 : isSelected ? 100 : index,
                };

                return (
                    <div
                        key={rune.id}
                        data-rune-index={index}
                        data-rune-id={rune.id}
                        className={`${styles.cardSlot} ${isHidden ? styles.hidden : ""} ${isDragging ? styles.dragging : ""}`}
                        style={slotStyle}
                        onPointerDown={(e) => onSlotPointerDown(e, rune.id, index)}
                        onDragStart={(e) => e.preventDefault()}
                    >
                        <RuneCard
                            rune={rune}
                            isSelected={isSelected}
                            index={index}
                            rotation={rotation}
                            tiltDisabled={dragInfo !== null}
                        />
                    </div>
                );
            })}
        </div>
    );
}
