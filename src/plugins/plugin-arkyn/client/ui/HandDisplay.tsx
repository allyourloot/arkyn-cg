import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
    useHand,
    useSelectedIndices,
    useIsCastAnimating,
    useIsDiscardAnimating,
    useDrawingRuneIds,
    useCastingRuneIds,
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
    const castingRuneIds = useCastingRuneIds();

    const containerRef = useRef<HTMLDivElement>(null);
    const animating = isCastAnimating || isDiscardAnimating;

    const { dragInfo, onSlotPointerDown } = useHandDragReorder({
        hand,
        containerRef,
        animating,
    });

    // Tracks whether the previous render had cast cards in flight, so the
    // cleanup branch below can tell "drag end" (smooth tween back) apart
    // from "cast end" (instant snap, since the hand layout JUST changed
    // beneath the persisted slot DOM nodes).
    const prevCastingCountRef = useRef(0);

    // Slot transform orchestration. Three branches:
    //   1. Drag in progress → slide non-dragged slots aside.
    //   2. Cast in progress → slide non-casting slots LEFT to fill the gap
    //      left by the runes flying to the play area. Each remaining slot
    //      moves by `stride * (count of casting slots to its left)` so the
    //      hand visually compacts to the leftmost positions.
    //   3. Cleanup → return to x=0. After a CAST we snap instantly (the
    //      sync system replaced the hand in the same React commit, so the
    //      persisted slots' new flex positions already match where they
    //      were visually — anything but a snap would jitter). After a DRAG
    //      we tween smoothly so the slid-aside slots ease home.
    useGSAP(() => {
        const container = containerRef.current;
        if (!container) return;
        const slots = container.querySelectorAll<HTMLElement>("[data-rune-index]");

        const wasCasting = prevCastingCountRef.current > 0;
        prevCastingCountRef.current = castingRuneIds.length;

        if (dragInfo) {
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
            return;
        }

        if (castingRuneIds.length > 0) {
            // Measure the natural stride between adjacent slots via offsetLeft
            // (independent of any GSAP-applied transform). All slots are at
            // x=0 at the moment this branch first fires (the cleanup branch
            // before this cast had already returned them to zero).
            let stride = 0;
            if (slots.length >= 2) {
                stride = slots[1].offsetLeft - slots[0].offsetLeft;
            }
            slots.forEach((slot, index) => {
                const runeId = slot.getAttribute("data-rune-id");
                if (!runeId || castingRuneIds.includes(runeId)) {
                    // Casting slot itself stays put — it's hidden via opacity
                    // and its rune is flying out via the overlay flyer.
                    gsap.to(slot, { x: 0, duration: 0.25, ease: "power2.out", overwrite: "auto" });
                    return;
                }
                let castingBefore = 0;
                for (let i = 0; i < index; i++) {
                    const otherId = slots[i].getAttribute("data-rune-id");
                    if (otherId && castingRuneIds.includes(otherId)) castingBefore++;
                }
                gsap.to(slot, { x: -stride * castingBefore, duration: 0.25, ease: "power2.out", overwrite: "auto" });
            });
            return;
        }

        // Cleanup. Snap instantly if we just exited a cast (the new hand
        // layout commit already moved the persisted slots into the right
        // visual positions); otherwise tween smoothly for drag-end feel.
        if (wasCasting) {
            gsap.killTweensOf(slots, "x");
            gsap.set(slots, { x: 0 });
        } else {
            gsap.to(slots, { x: 0, duration: 0.18, ease: "power2.out", overwrite: "auto" });
        }
    }, {
        dependencies: [
            dragInfo?.previewIdx,
            dragInfo?.originalIdx,
            dragInfo?.runeId,
            castingRuneIds,
            hand,
        ],
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
                // Runes mid-cast stay hidden in the hand for the entire
                // sequence — the deferred server hand-sync would otherwise
                // leave them visible until the dissolve completes.
                const isCastingOut = castingRuneIds.includes(rune.id);
                const isHidden = isHiddenForCast || isDrawingIn || isCastingOut;
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
