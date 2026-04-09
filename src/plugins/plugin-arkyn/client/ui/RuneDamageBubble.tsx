import { useRef, type CSSProperties } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ELEMENT_COLORS } from "./styles";
import styles from "./RuneDamageBubble.module.css";

interface Props {
    /** The damage number to display. */
    amount: number;
    /** Element of the resolved spell — drives the stroke (outline) color. */
    spellElement: string;
    /**
     * Monotonically increasing per-cast sequence number. Used as a React
     * key so casting two spells in a row remounts the bubble and replays
     * the animation cleanly.
     */
    seq: number;
    /**
     * Milliseconds of delay before this bubble appears. Used to stagger
     * bubbles across contributing runes so they read like a counter
     * ticking up.
     */
    delayMs: number;
}

export default function RuneDamageBubble({ amount, spellElement, seq, delayMs }: Props) {
    const bubbleRef = useRef<HTMLSpanElement>(null);
    const strokeColor = ELEMENT_COLORS[spellElement] ?? "#ffffff";

    // GSAP-driven 4-keyframe pop: enter from below + tiny → overshoot
    // larger → settle → drift up + fade. Replaces the CSS @keyframes
    // damageBubble animation. The horizontal centering uses GSAP's
    // `xPercent: -50` (equivalent to CSS translateX(-50%)) so it composes
    // with the animated y/scale without fighting the matrix.
    useGSAP(() => {
        const el = bubbleRef.current;
        if (!el) return;
        gsap.set(el, { xPercent: -50, y: 6, scale: 0.55, opacity: 0 });
        const tl = gsap.timeline({ delay: delayMs / 1000 });
        tl.to(el, {
            y: -10,
            scale: 1.18,
            opacity: 1,
            duration: 0.13,
            ease: "back.out(2)",
        })
            .to(el, {
                y: -14,
                scale: 1,
                duration: 0.07,
                ease: "power2.out",
            })
            .to(el, {
                y: -38,
                opacity: 0,
                duration: 0.4,
                ease: "power1.in",
            });
    }, { dependencies: [seq], scope: bubbleRef });

    // CSS variable lets the stylesheet apply -webkit-text-stroke without
    // hard-coding the color.
    const style: CSSProperties = {
        ["--stroke-color" as string]: strokeColor,
    };
    return (
        <span
            ref={bubbleRef}
            key={seq}
            className={styles.bubble}
            style={style}
        >
            {amount}
        </span>
    );
}
