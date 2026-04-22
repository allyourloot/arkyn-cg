import { useCallback, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
    useHand,
    useSelectedIndices,
    useIsCastAnimating,
    useIsDiscardAnimating,
    useDrawingRuneIds,
    useCastingRuneIds,
    useHandSize,
} from "../arkynStore";
import { useBanishingRuneIds } from "../arkynAnimations";
import RuneCard from "./RuneCard";
import { useHandDragReorder } from "./hooks/useHandDragReorder";
import handFrameUrl from "/assets/ui/hand-frame.png?url";
import styles from "./HandDisplay.module.css";

const handStyleVarsBase = {
    "--hand-bg": `url(${handFrameUrl})`,
} as React.CSSProperties;

export default function HandDisplay() {
    const hand = useHand();
    const selectedIndices = useSelectedIndices();
    const isCastAnimating = useIsCastAnimating();
    const isDiscardAnimating = useIsDiscardAnimating();
    const drawingRuneIds = useDrawingRuneIds();
    const castingRuneIds = useCastingRuneIds();
    const banishingRuneIds = useBanishingRuneIds();
    const maxHandSize = useHandSize();

    const containerRef = useRef<HTMLDivElement>(null);
    const animating = isCastAnimating || isDiscardAnimating;

    // ── Fixed frame, dynamic overlap ──
    // The hand frame has a fixed CSS width. We measure its inner content
    // width (minus padding) and a single card's width once on mount via
    // a ref callback, then compute the negative margin needed to fit N
    // cards into that fixed space.
    const [frameDims, setFrameDims] = useState<{ innerW: number; cardW: number } | null>(null);
    const measuredRef = useRef(false);
    const containerCallbackRef = useCallback((el: HTMLDivElement | null) => {
        // Wire up the imperative ref that the rest of the component uses.
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        if (!el || measuredRef.current) return;
        // Measure after a frame so layout is settled.
        requestAnimationFrame(() => {
            const cs = getComputedStyle(el);
            const padL = parseFloat(cs.paddingLeft) || 0;
            const padR = parseFloat(cs.paddingRight) || 0;
            const innerW = el.clientWidth - padL - padR;
            const firstCard = el.querySelector<HTMLElement>("[data-rune-index]");
            const cardW = firstCard ? firstCard.offsetWidth : 0;
            if (innerW > 0 && cardW > 0) {
                setFrameDims({ innerW, cardW });
                measuredRef.current = true;
            }
        });
    }, []);

    // Compute the overlap needed to fit `hand.length` cards into the
    // fixed inner width. For <= reference count, use the CSS default.
    let handStyle: React.CSSProperties = handStyleVarsBase;
    if (frameDims && hand.length > 1) {
        const { innerW, cardW } = frameDims;
        // Total width of N cards without overlap = N * cardW.
        // We need: cardW + (N-1) * (cardW + overlap) = innerW
        //   => overlap = (innerW - N * cardW) / (N - 1)
        const neededOverlap = (innerW - hand.length * cardW) / (hand.length - 1);
        // Only apply when we need to compress (negative overlap).
        // Clamp so cards never overlap more than 80% (stay readable).
        const clamped = Math.max(-cardW * 0.8, neededOverlap);
        handStyle = {
            ...handStyleVarsBase,
            "--card-overlap": `${Math.round(clamped)}px`,
        } as React.CSSProperties;
    }

    const { dragInfo, onSlotPointerDown } = useHandDragReorder({
        hand,
        containerRef,
        animating,
    });

    // Tracks whether the previous render had a drag in progress so the
    // cleanup branch can tell drag-end (skip FLIP, the dragged slot was
    // already zeroed by useHandDragReorder before commit) apart from
    // sort / auto-sort cleanups (apply FLIP).
    const prevDraggingRef = useRef(false);

    // Per-slot layout map (rune-id → offsetLeft from the previous useGSAP
    // run). Used by the FLIP branch to compute "old visual position →
    // new visual position" deltas so kept slots smoothly animate when
    // setHand auto-sorts the hand under them.
    const prevSlotLayoutsRef = useRef<Map<string, number>>(new Map());

    // Slot transform orchestration. Four branches in priority order:
    //   1. Drag in progress → slide non-dragged slots aside.
    //   2. Cast in progress → slide non-casting slots LEFT to fill the
    //      gap left by the runes flying to the play area.
    //   3. Drag just ended → tween slid-aside slots back to 0
    //      (useHandDragReorder already zeroed the dragged slot).
    //   4. FLIP / cleanup → animate kept slots from their old visual
    //      positions to their new flex positions whenever the hand
    //      reorders (sort button, auto-sort on draw, cast-end with
    //      sort). Uses a stored map of previous offsetLefts to bridge
    //      the React commit boundary smoothly.
    useGSAP(() => {
        const container = containerRef.current;
        if (!container) return;
        const slots = container.querySelectorAll<HTMLElement>("[data-rune-index]");

        // Capture each slot's current offsetLeft for the next FLIP run.
        // Called at the END of every branch so the next render has
        // accurate "where things were" data even if a non-FLIP branch
        // ran in between.
        const captureLayouts = () => {
            const out = new Map<string, number>();
            slots.forEach(slot => {
                const id = slot.getAttribute("data-rune-id");
                if (id) out.set(id, slot.offsetLeft);
            });
            prevSlotLayoutsRef.current = out;
        };

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
            prevDraggingRef.current = true;
            captureLayouts();
            return;
        }

        // Drag transitioned from active to inactive between this render
        // and the previous one — clear the flag and remember it locally
        // so the cleanup branches can take a different path.
        const justEndedDrag = prevDraggingRef.current;
        prevDraggingRef.current = false;

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
            captureLayouts();
            return;
        }

        // Drag just ended → preserve the original drag-end behavior:
        // tween any slid-aside slots from their offset back to 0. The
        // dragged slot itself was zeroed synchronously by
        // useHandDragReorder before reorderHand committed, so it's
        // already at its target visual position and gets a no-op tween.
        // We deliberately SKIP the FLIP branch here because reorderHand
        // doesn't auto-sort — the player's manually-placed order is
        // exactly the final layout and no FLIP correction is needed.
        if (justEndedDrag) {
            gsap.to(slots, { x: 0, duration: 0.18, ease: "power2.out", overwrite: "auto" });
            captureLayouts();
            return;
        }

        // FLIP / cleanup branch.
        //
        // Whenever the hand reorders without a drag or cast in progress
        // — auto-sort on draw, manual sort button click, cast-end where
        // setHand reordered the kept runes — kept slots may end up at
        // different flex positions than where they were visually right
        // before the React commit. The FLIP pattern bridges the gap:
        //
        //   1. Read each slot's previous offsetLeft from the ref
        //      (captured by the previous useGSAP run).
        //   2. Compute the layout delta vs the slot's new offsetLeft.
        //   3. Add that delta to the slot's current transform — this
        //      preserves the slot's visual position across the commit
        //      because transform contributes additively to layout.
        //   4. Tween the transform back to 0, smoothly animating the
        //      slot from its old visual position to its new flex spot.
        //
        // For brand-new runes (no previous-layout entry), we leave the
        // slot alone — DrawAnimation handles the fly-in via an overlay
        // flyer, and the underlying slot is hidden until that finishes.
        const oldLayouts = prevSlotLayoutsRef.current;
        slots.forEach(slot => {
            const id = slot.getAttribute("data-rune-id");
            if (!id) return;
            const newLayout = slot.offsetLeft;
            const oldLayout = oldLayouts.get(id);
            if (oldLayout === undefined) return;
            const layoutDelta = oldLayout - newLayout;
            if (Math.abs(layoutDelta) <= 0.5) return;
            const currentX = (gsap.getProperty(slot, "x") as number) || 0;
            gsap.set(slot, { x: currentX + layoutDelta });
        });

        // One unified tween for all slots: FLIP-set transforms animate
        // from "old visual position" → "new flex position", and any
        // unchanged-but-still-transformed slots (cast-slide residue)
        // animate home as well.
        gsap.to(slots, { x: 0, duration: 0.32, ease: "power2.out", overwrite: "auto" });

        captureLayouts();
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
        <div className={styles.handRow}>
            <div ref={containerCallbackRef} className={styles.hand} style={handStyle}>
                {hand.map((rune, index) => {
                    const rotation = totalCards > 1 ? startAngle + angleStep * index : 0;
                    const isSelected = selectedIndices.includes(index);
                    const isHiddenForCast = animating && isSelected;
                    const isDrawingIn = drawingRuneIds.includes(rune.id);
                    // Runes mid-cast stay hidden in the hand for the entire
                    // sequence — the deferred server hand-sync would otherwise
                    // leave them visible until the dissolve completes.
                    const isCastingOut = castingRuneIds.includes(rune.id);
                    // Same reason for Banish: the dissolving flyer is
                    // absolutely positioned over the hand slot, and
                    // painting a fully-intact hand rune underneath would
                    // poke through the semi-transparent dissolve pixels.
                    const isBanishingOut = banishingRuneIds.includes(rune.id);
                    const isHidden = isHiddenForCast || isDrawingIn || isCastingOut || isBanishingOut;
                    const isDragging = dragInfo !== null && dragInfo.runeId === rune.id;

                    // Slot transform x is GSAP-driven (see useGSAP above and
                    // the quickTo follow inside useHandDragReorder). Only
                    // zIndex is React-controlled here. Selected cards keep
                    // their natural stacking order so they don't cover the
                    // clickable area of neighboring cards — the lift animation
                    // (translateY) provides enough visual separation.
                    const slotStyle: React.CSSProperties = {
                        zIndex: isDragging ? 200 : index,
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
            <span className={styles.handSize}>{hand.length - castingRuneIds.length}/{maxHandSize}</span>
        </div>
    );
}
