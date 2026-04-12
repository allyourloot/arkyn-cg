import { useRef, type CSSProperties } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ELEMENT_COLORS } from "./styles";
import criticalUrl from "/assets/ui/critical.png?url";
import styles from "./RuneDamageBubble.module.css";

interface Props {
    /** Final damage number AFTER the elemental modifier (resistance / weakness). */
    amount: number;
    /** Display value — always equals `amount`. */
    baseAmount: number;
    /** Element of the resolved spell — drives the stroke (outline) color. */
    spellElement: string;
    /** Whether this rune hit a weakness — shows the critical burst behind the number. */
    isCritical: boolean;
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

const BASE_COLOR = "#ffffff";

export default function RuneDamageBubble({ amount, baseAmount, spellElement, isCritical, seq, delayMs }: Props) {
    const bubbleRef = useRef<HTMLSpanElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const criticalRef = useRef<HTMLImageElement>(null);
    const strokeColor = ELEMENT_COLORS[spellElement] ?? "#ffffff";

    useGSAP(() => {
        const el = bubbleRef.current;
        const textEl = textRef.current;
        const critEl = criticalRef.current;
        if (!el) return;
        if (textEl) textEl.textContent = String(baseAmount);
        gsap.set(el, { xPercent: -50, y: 6, scale: 0.55, opacity: 0, color: BASE_COLOR });
        if (critEl) gsap.set(critEl, { opacity: 0, scale: 0.5, xPercent: -50, yPercent: -50 });

        const tl = gsap.timeline({ delay: delayMs / 1000 });

        // Phase 1: pop in (130ms)
        tl.to(el, {
            y: -10,
            scale: isCritical ? 1.38 : 1.18,
            opacity: 1,
            duration: 0.13,
            ease: isCritical ? "back.out(2.5)" : "back.out(2)",
        });

        // Critical burst pops in simultaneously with the number.
        if (critEl && isCritical) {
            tl.to(critEl, {
                opacity: 1,
                scale: 1,
                duration: 0.13,
                ease: "back.out(2.5)",
            }, "<");
        }

        // Phase 2: settle (70ms)
        tl.to(el, {
            y: -14,
            scale: isCritical ? 1.12 : 1,
            duration: 0.07,
            ease: "power2.out",
        });

        // Phase 3: hold so the number lingers, then drift away.
        tl.to({}, { duration: 0.15 });
        tl.to(el, {
            y: -38,
            opacity: 0,
            duration: 0.4,
            ease: "power1.in",
        });
    }, { dependencies: [seq], scope: bubbleRef });

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
            {isCritical && (
                <img
                    ref={criticalRef}
                    src={criticalUrl}
                    alt=""
                    className={styles.criticalBg}
                />
            )}
            <span ref={textRef}>{baseAmount}</span>
        </span>
    );
}
