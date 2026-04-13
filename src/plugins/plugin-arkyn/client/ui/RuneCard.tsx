import { memo, useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import type { RuneClientData } from "../arkynStore";
import {
    SELECT_LIFT_PX,
    SELECT_SCALE,
    SELECT_JITTER_DEG,
    SELECT_EASE,
    SELECT_DURATION_S,
    DESELECT_EASE,
    DESELECT_DURATION_S,
} from "../animations/runeCardMotion";
import RuneImage from "./RuneImage";
import { HAS_HOVER } from "./utils/hasHover";
import styles from "./RuneCard.module.css";

const MAX_TILT_DEG = 14;
const PERSPECTIVE_PX = 600;
const HOVER_POP_SCALE = 1.08;
const HOVER_POP_DURATION = 0.05;
const HOVER_POP_EASE = "power4.out";
const HOVER_SHRINK_DURATION = 0.08;
const HOVER_SHRINK_EASE = "power3.out";

interface RuneCardProps {
    rune: RuneClientData;
    isSelected: boolean;
    index: number;
    rotation?: number;
    /** When true, tilt-on-hover is suppressed (e.g. during a drag). */
    tiltDisabled?: boolean;
}

const FLOAT_STAGGER_S = 0.32;

function RuneCardImpl({
    rune,
    isSelected,
    index,
    rotation = 0,
    tiltDisabled = false,
}: RuneCardProps) {
    const cardRef = useRef<HTMLDivElement>(null);
    const popRef = useRef<HTMLDivElement>(null);
    const [tilt, setTilt] = useState({ rotX: 0, rotY: 0 });
    // First-render guard so the very first useGSAP pass uses gsap.set
    // (instant) instead of gsap.to (animated). Otherwise the card would
    // briefly tween from rotation:0 to its fan rotation on mount.
    const didMountRef = useRef(false);

    // Reset tilt as soon as the parent disables it (e.g. on drag start) so a
    // stale tilt doesn't combine with the drag transform.
    useEffect(() => {
        if (tiltDisabled) setTilt({ rotX: 0, rotY: 0 });
    }, [tiltDisabled]);

    // GSAP-driven select / deselect lift. Uses `overwrite: 'auto'` so rapid
    // clicks on different cards retarget cleanly mid-flight without leaving
    // any card in a stuck "half-lifted" state. Replaces the previous CSS
    // transition on `.card { transform }` for snappier, interruptible motion.
    useGSAP(() => {
        const el = cardRef.current;
        if (!el) return;
        if (!didMountRef.current) {
            // Snap to the initial fan rotation without animating from 0 on
            // first mount. Subsequent renders go through gsap.to.
            gsap.set(el, { y: 0, rotation, scale: 1 });
            didMountRef.current = true;
            return;
        }
        if (isSelected) {
            gsap.to(el, {
                y: SELECT_LIFT_PX,
                rotation: rotation + SELECT_JITTER_DEG,
                scale: SELECT_SCALE,
                duration: SELECT_DURATION_S,
                ease: SELECT_EASE,
                overwrite: "auto",
            });
        } else {
            gsap.to(el, {
                y: 0,
                rotation,
                scale: 1,
                duration: DESELECT_DURATION_S,
                ease: DESELECT_EASE,
                overwrite: "auto",
            });
        }
    }, { dependencies: [isSelected, rotation], scope: cardRef });

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (tiltDisabled) return;
        const card = cardRef.current;
        if (!card) return;
        const rect = card.getBoundingClientRect();
        // Normalize cursor to (-1..+1) over the card's bounds.
        const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
        // CSS rotation conventions:
        //   - rotateX positive → top of card tilts toward viewer.
        //     Cursor at top has ny<0, so rotX = -ny * MAX makes top come forward.
        //   - rotateY positive → left of card tilts toward viewer.
        //     Cursor at left has nx<0, so rotY = -nx * MAX makes left come forward.
        setTilt({
            rotX: -ny * MAX_TILT_DEG,
            rotY: -nx * MAX_TILT_DEG,
        });
    };

    const handlePointerEnter = () => {
        if (tiltDisabled) return;
        const el = popRef.current;
        if (!el) return;
        gsap.to(el, {
            scale: HOVER_POP_SCALE,
            duration: HOVER_POP_DURATION,
            ease: HOVER_POP_EASE,
            overwrite: "auto",
        });
    };

    const handlePointerLeave = () => {
        setTilt({ rotX: 0, rotY: 0 });
        const el = popRef.current;
        if (!el) return;
        gsap.to(el, {
            scale: 1,
            duration: HOVER_SHRINK_DURATION,
            ease: HOVER_SHRINK_EASE,
            overwrite: "auto",
        });
    };

    return (
        <div
            ref={cardRef}
            // Tilt handlers only attach on devices with a real hover state.
            // On touch they're a no-op, saving a setState per touchmove.
            onPointerEnter={HAS_HOVER ? handlePointerEnter : undefined}
            onPointerMove={HAS_HOVER ? handlePointerMove : undefined}
            onPointerLeave={HAS_HOVER ? handlePointerLeave : undefined}
            className={`${styles.card} ${isSelected ? styles.selected : ""}`}
        >
            <div
                className={styles.floatWrap}
                // Negative delay starts each card mid-cycle so they're already
                // out of phase on first render rather than slowly drifting apart.
                style={{ animationDelay: `${-index * FLOAT_STAGGER_S}s` }}
            >
                <div ref={popRef} className={styles.popWrap}>
                    <div
                        className={styles.tiltInner}
                        style={{
                            transform: `perspective(${PERSPECTIVE_PX}px) rotateX(${tilt.rotX}deg) rotateY(${tilt.rotY}deg)`,
                        }}
                    >
                        <RuneImage
                            rarity={rune.rarity}
                            element={rune.element}
                            className={styles.layer}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

// Memoize so a tap on one rune only re-renders that rune's card instead of
// re-rendering all 7+ cards in the hand. With the unused onClick prop gone,
// every prop is a primitive (or a stable rune object reference), so the
// default shallow comparison is enough.
const RuneCard = memo(RuneCardImpl);
export default RuneCard;
