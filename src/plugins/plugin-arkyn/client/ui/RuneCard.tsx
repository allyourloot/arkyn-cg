import { memo, useEffect, useRef, useState } from "react";
import type { RuneClientData } from "../arkynStore";
import { getRuneImageUrl, getBaseRuneImageUrl } from "./runeAssets";
import styles from "./RuneCard.module.css";

const MAX_TILT_DEG = 14;
const PERSPECTIVE_PX = 600;

// Touch devices have no real "hover" state, so the 3D tilt-on-pointermove
// effect is purely cosmetic clutter on phones — and worse, the constant
// setState it triggers on every touch movement causes noticeable input lag.
// Detect once at module load and short-circuit the tilt logic on touch.
const HAS_HOVER =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: hover)").matches;

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
    const runeUrl = getRuneImageUrl(rune.element);
    const baseUrl = getBaseRuneImageUrl(rune.rarity);

    const cardRef = useRef<HTMLDivElement>(null);
    const [tilt, setTilt] = useState({ rotX: 0, rotY: 0 });

    // Reset tilt as soon as the parent disables it (e.g. on drag start) so a
    // stale tilt doesn't combine with the drag transform.
    useEffect(() => {
        if (tiltDisabled) setTilt({ rotX: 0, rotY: 0 });
    }, [tiltDisabled]);

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

    const handlePointerLeave = () => {
        setTilt({ rotX: 0, rotY: 0 });
    };

    return (
        <div
            ref={cardRef}
            // Tilt handlers only attach on devices with a real hover state.
            // On touch they're a no-op, saving a setState per touchmove.
            onPointerMove={HAS_HOVER ? handlePointerMove : undefined}
            onPointerLeave={HAS_HOVER ? handlePointerLeave : undefined}
            className={`${styles.card} ${isSelected ? styles.selected : ""}`}
            style={{
                transform: `translateY(${isSelected ? -24 : 0}px) rotate(${rotation}deg)`,
            }}
        >
            <div
                className={styles.floatWrap}
                // Negative delay starts each card mid-cycle so they're already
                // out of phase on first render rather than slowly drifting apart.
                style={{ animationDelay: `${-index * FLOAT_STAGGER_S}s` }}
            >
                <div
                    className={styles.tiltInner}
                    style={{
                        transform: `perspective(${PERSPECTIVE_PX}px) rotateX(${tilt.rotX}deg) rotateY(${tilt.rotY}deg)`,
                    }}
                >
                    {/* Base rarity image (bottom layer) */}
                    {baseUrl && (
                        <img src={baseUrl} alt="" className={styles.layer} draggable={false} />
                    )}
                    {/* Rune type icon (top layer) */}
                    {runeUrl && (
                        <img src={runeUrl} alt={rune.element} className={styles.layer} draggable={false} />
                    )}
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
