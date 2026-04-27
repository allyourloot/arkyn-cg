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
 *
 * Per-slot ARRAY input: when Mimic copies Synapse, two bubbles pop on
 * the same Psy rune (one per Synapse invocation). Each entry carries
 * its own staggered `delayMs` so they sequence cleanly.
 */
export default function MultBubbleOverlay() {
    const handMultBubbles = useHandMultBubbles();
    const [positions, setPositions] = useState<{ slot: number; entryIdx: number; x: number; y: number; bubble: HandMultBubble }[]>([]);

    useEffect(() => {
        // Common case: the cast has no Synapse procs. handMultBubbles is
        // either empty or every slot is empty. Skip the DOM queries and
        // the setState — if positions was already empty we don't trigger
        // a needless re-render either.
        let hasAny = false;
        for (let i = 0; i < handMultBubbles.length; i++) {
            const sb = handMultBubbles[i];
            if (sb && sb.length > 0) { hasAny = true; break; }
        }
        if (!hasAny) {
            setPositions(prev => prev.length === 0 ? prev : []);
            return;
        }

        // One querySelectorAll instead of N querySelectors — a single
        // tree walk plus an indexed lookup rather than N attribute
        // selector matches. Matters when a Mimic-doubled Synapse fires
        // bubbles across several Psy runes.
        const all = document.querySelectorAll<HTMLElement>("[data-rune-index]");
        const slotEls = new Map<number, HTMLElement>();
        for (const el of all) {
            const idx = Number(el.dataset.runeIndex);
            if (!Number.isNaN(idx)) slotEls.set(idx, el);
        }

        const entries: typeof positions = [];
        for (let i = 0; i < handMultBubbles.length; i++) {
            const slotBubbles = handMultBubbles[i];
            if (!slotBubbles || slotBubbles.length === 0) continue;
            const el = slotEls.get(i);
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
    }, [handMultBubbles]);

    if (positions.length === 0) return null;

    return (
        <div className={styles.overlay}>
            {positions.map(({ slot, entryIdx, x, y, bubble }) => (
                <MultBubbleItem
                    key={`${slot}-${entryIdx}-${bubble.seq}`}
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
