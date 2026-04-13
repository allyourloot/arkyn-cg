import { useRef, useEffect, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { useHandMultBubbles, type HandMultBubble } from "../arkynAnimations";
import styles from "./MultBubble.module.css";

/**
 * Fixed-position overlay that renders "+N Mult" bubbles above held Psy
 * rune cards when the Synapse sigil procs. Completely decoupled from
 * HandDisplay's component tree to avoid triggering WebGL context churn
 * on the rune card canvases.
 */
export default function MultBubbleOverlay() {
    const handMultBubbles = useHandMultBubbles();
    const [positions, setPositions] = useState<{ index: number; x: number; y: number; bubble: HandMultBubble }[]>([]);

    useEffect(() => {
        const entries: typeof positions = [];
        for (let i = 0; i < handMultBubbles.length; i++) {
            const bubble = handMultBubbles[i];
            if (!bubble) continue;
            const el = document.querySelector(`[data-rune-index="${i}"]`);
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            entries.push({
                index: i,
                x: rect.left + rect.width / 2,
                y: rect.top,
                bubble,
            });
        }
        setPositions(entries);
    }, [handMultBubbles]);

    if (positions.length === 0) return null;

    return (
        <div className={styles.overlay}>
            {positions.map(({ index, x, y, bubble }) => (
                <MultBubbleItem
                    key={`${index}-${bubble.seq}`}
                    x={x}
                    y={y}
                    amount={bubble.amount}
                    seq={bubble.seq}
                    delayMs={bubble.delayMs}
                />
            ))}
        </div>
    );
}

function MultBubbleItem({ x, y, amount, seq, delayMs }: {
    x: number; y: number; amount: number; seq: number; delayMs: number;
}) {
    const bubbleRef = useRef<HTMLSpanElement>(null);

    useGSAP(() => {
        const el = bubbleRef.current;
        if (!el) return;
        gsap.set(el, { y: 6, scale: 0.55, opacity: 0 });

        const tl = gsap.timeline({ delay: delayMs / 1000 });
        tl.to(el, { y: -10, scale: 1.25, opacity: 1, duration: 0.13, ease: "back.out(2.5)" });
        tl.to(el, { y: -14, scale: 1, duration: 0.07, ease: "power2.out" });
        tl.to({}, { duration: 0.15 });
        tl.to(el, { y: -38, opacity: 0, duration: 0.4, ease: "power1.in" });
    }, { dependencies: [seq], scope: bubbleRef });

    return (
        <span
            ref={bubbleRef}
            className={styles.bubble}
            style={{ left: x, top: y }}
        >
            +{amount} Mult
        </span>
    );
}
