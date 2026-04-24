import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import styles from "./RuneXMultBubble.module.css";

interface Props {
    /** Multiplicative factor (e.g. 1.5 for "x1.5"). Displayed as-is. */
    factor: number;
    /**
     * Monotonically increasing per-cast sequence number. Used as a React
     * key so casting two spells in a row remounts the bubble and replays
     * the GSAP tween from scratch.
     */
    seq: number;
    /**
     * Milliseconds of delay before this bubble animates. Pre-computed by
     * the cast breakdown so the bubbles stagger across contributing
     * runes in the same order Big Bang's xMult events fire on the timeline
     * (x1 over R1, x1.5 over R2, … x3 over R5 for the default config).
     */
    delayMs: number;
}

/**
 * Floating "x{factor}" bubble that pops above a contributing rune slot
 * when a cumulative cast xMult sigil (Big Bang) resolves. Styled to
 * match the xMult tooltip pill — red background, white text — so the
 * in-cast reveal and the description-tooltip marker share a visual
 * vocabulary.
 *
 * Mounted per slot by PlayArea against `xMultBubblesForCast[slotIdx]`,
 * parallel to the proc-bubble mounting pattern so multi-rune casts
 * render one component per factor with its own staggered delay.
 */
export default function RuneXMultBubble({ factor, seq, delayMs }: Props) {
    const bubbleRef = useRef<HTMLSpanElement>(null);

    useGSAP(() => {
        const el = bubbleRef.current;
        if (!el) return;
        // Slight crooked tilt per pop so rapid back-to-back factors read
        // as individual "stamped" reveals rather than a single wobble.
        // Held constant through the tween (not animated) — matches the
        // SigilXMultProcBubble pattern.
        const rotation = (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 4);
        gsap.set(el, { xPercent: -50, y: 6, scale: 0.55, opacity: 0, rotation });

        const tl = gsap.timeline({ delay: delayMs / 1000 });
        tl.to(el, { y: -12, scale: 1.2, opacity: 1, duration: 0.14, ease: "back.out(2.5)" });
        tl.to(el, { y: -16, scale: 1, duration: 0.07, ease: "power2.out" });
        tl.to({}, { duration: 0.3 });
        tl.to(el, { y: -42, opacity: 0, duration: 0.4, ease: "power1.in" });
    }, { dependencies: [seq], scope: bubbleRef });

    return (
        <span ref={bubbleRef} className={styles.bubble}>
            x{factor}
        </span>
    );
}
