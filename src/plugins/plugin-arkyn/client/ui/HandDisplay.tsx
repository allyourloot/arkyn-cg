import { useRef } from "react";
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

                const slotStyle: React.CSSProperties = {
                    zIndex: isDragging ? 200 : isSelected ? 100 : index,
                };

                // Drag visuals: dragged card follows the cursor; the cards
                // between the original and preview positions slide aside.
                if (dragInfo !== null) {
                    const stride = dragInfo.cardStride;
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
                            rotation={rotation}
                            tiltDisabled={dragInfo !== null}
                        />
                    </div>
                );
            })}
        </div>
    );
}
