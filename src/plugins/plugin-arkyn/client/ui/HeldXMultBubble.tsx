import { useRef, useEffect, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { useHeldXMultBubbles, type RuneXMultBubble } from "../arkynAnimations";
import styles from "./HeldXMultBubble.module.css";

/**
 * Fixed-position overlay that renders "x{factor}" bubbles above held
 * rune cards when a held-element xMult sigil (Clairvoyant) procs.
 * Decoupled from HandDisplay's component tree (same pattern as
 * MultBubbleOverlay) so mount/unmount doesn't churn WebGL contexts on
 * the rune card canvases.
 *
 * Per-slot ARRAY input: when Mimic copies Clairvoyant, two bubbles
 * pop on the same Psy rune (one per Clairvoyant invocation). Each
 * entry carries its own staggered `delayMs` so they sequence cleanly.
 */
export default function HeldXMultBubbleOverlay() {
    const heldXMultBubbles = useHeldXMultBubbles();
    const [positions, setPositions] = useState<{ slot: number; entryIdx: number; x: number; y: number; bubble: RuneXMultBubble }[]>([]);

    useEffect(() => {
        const entries: typeof positions = [];
        for (let i = 0; i < heldXMultBubbles.length; i++) {
            const slotBubbles = heldXMultBubbles[i];
            if (!slotBubbles || slotBubbles.length === 0) continue;
            const el = document.querySelector(`[data-rune-index="${i}"]`);
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            for (let j = 0; j < slotBubbles.length; j++) {
                entries.push({
                    slot: i,
                    entryIdx: j,
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                    bubble: slotBubbles[j],
                });
            }
        }
        setPositions(entries);
    }, [heldXMultBubbles]);

    if (positions.length === 0) return null;

    return (
        <div className={styles.overlay}>
            {positions.map(({ slot, entryIdx, x, y, bubble }) => (
                <HeldXMultBubbleItem
                    key={`${slot}-${entryIdx}-${bubble.seq}`}
                    x={x}
                    y={y}
                    factor={bubble.factor}
                    seq={bubble.seq}
                    delayMs={bubble.delayMs}
                />
            ))}
        </div>
    );
}

function HeldXMultBubbleItem({ x, y, factor, seq, delayMs }: {
    x: number; y: number; factor: number; seq: number; delayMs: number;
}) {
    const bubbleRef = useRef<HTMLSpanElement>(null);

    useGSAP(() => {
        const el = bubbleRef.current;
        if (!el) return;
        const rotation = (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 4);
        gsap.set(el, { y: 6, scale: 0.55, opacity: 0, rotation });

        const tl = gsap.timeline({ delay: delayMs / 1000 });
        tl.to(el, { y: -12, scale: 1.2, opacity: 1, duration: 0.14, ease: "back.out(2.5)" });
        tl.to(el, { y: -16, scale: 1, duration: 0.07, ease: "power2.out" });
        tl.to({}, { duration: 0.3 });
        tl.to(el, { y: -42, opacity: 0, duration: 0.4, ease: "power1.in" });
    }, { dependencies: [seq], scope: bubbleRef });

    return (
        <span
            ref={bubbleRef}
            className={styles.bubble}
            style={{ left: x, top: y }}
        >
            x{factor}
        </span>
    );
}
