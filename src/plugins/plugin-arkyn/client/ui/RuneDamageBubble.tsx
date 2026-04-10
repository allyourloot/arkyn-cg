import { useRef, type CSSProperties } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ELEMENT_COLORS } from "./styles";
import criticalUrl from "/assets/ui/critical.png?url";
import styles from "./RuneDamageBubble.module.css";

interface Props {
    /** Final damage number AFTER the elemental modifier (resistance / weakness). */
    amount: number;
    /**
     * Pre-modifier damage number. When equal to `amount`, the bubble pops
     * once normally. When less than `amount` (weakness boost), the bubble
     * pops with `baseAmount` first, holds briefly, then pops AGAIN to
     * `amount` with a yellow flash to highlight the weakness bonus.
     */
    baseAmount: number;
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

// Bonus pop color — bright canary yellow, distinct from `lightning`
// (#fbbf24) and `holy` (#fef08a) so weakness bonuses always read clearly.
const BONUS_COLOR = "#ffe24a";
const BASE_COLOR = "#ffffff";

export default function RuneDamageBubble({ amount, baseAmount, spellElement, seq, delayMs }: Props) {
    const bubbleRef = useRef<HTMLSpanElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const criticalRef = useRef<HTMLImageElement>(null);
    const strokeColor = ELEMENT_COLORS[spellElement] ?? "#ffffff";
    // Only the upward (weakness → critical) case triggers the two-pop
    // sequence. Resisted runes have `amount < baseAmount` and just show
    // their reduced value directly — no misleading "pop down" animation.
    const isBonus = amount > baseAmount;

    // GSAP-driven pop. Two flavors:
    //   - Normal: pop in → settle → hold → drift up + fade. Total 750ms.
    //   - Bonus:  pop in (base value) → settle → hold → SECOND POP (text
    //             swap to bonus value, color → yellow, scale punch) →
    //             settle bonus → drift up + fade. Total 750ms.
    // The horizontal centering uses GSAP's `xPercent: -50` so it composes
    // with the animated y/scale without fighting the matrix.
    useGSAP(() => {
        const el = bubbleRef.current;
        const textEl = textRef.current;
        const critEl = criticalRef.current;
        if (!el) return;
        // Reset text + color in case the same DOM node is reused across casts.
        // Update the inner text span (not el.textContent, which would destroy
        // sibling DOM nodes like the critical burst <img>).
        if (textEl) textEl.textContent = String(baseAmount);
        gsap.set(el, { xPercent: -50, y: 6, scale: 0.55, opacity: 0, color: BASE_COLOR });
        // Hide the critical burst until the bonus pop reveals it.
        // xPercent/yPercent handle centering here because GSAP owns the
        // transform property — a CSS translate would be overwritten by the
        // scale tween.
        if (critEl) gsap.set(critEl, { opacity: 0, scale: 0.5, xPercent: -50, yPercent: -50 });

        const tl = gsap.timeline({ delay: delayMs / 1000 });

        // Phase 1: pop in with the base value (130ms)
        tl.to(el, {
            y: -10,
            scale: 1.18,
            opacity: 1,
            duration: 0.13,
            ease: "back.out(2)",
        });
        // Phase 2: settle (70ms)
        tl.to(el, {
            y: -14,
            scale: 1,
            duration: 0.07,
            ease: "power2.out",
        });

        if (isBonus) {
            // Phase 3a: hold the base value briefly so the player reads it (80ms)
            tl.to({}, { duration: 0.08 });
            // Phase 3b: swap text to the bonus value
            tl.call(() => {
                if (textEl) textEl.textContent = String(amount);
            });
            // Phase 3c: bonus pop — bigger overshoot + flash to yellow (130ms)
            // Critical burst pops in at the same time as the yellow flash.
            if (critEl) {
                tl.to(critEl, {
                    opacity: 1,
                    scale: 1,
                    duration: 0.13,
                    ease: "back.out(2.5)",
                }, "<");
            }
            tl.to(el, {
                scale: 1.38,
                duration: 0.13,
                ease: "back.out(2.5)",
            }, "<");
            // Phase 3d: settle the bonus pop (50ms)
            tl.to(el, {
                scale: 1.12,
                duration: 0.05,
                ease: "power2.out",
            });
            // Phase 4: drift up + fade (290ms) — total 750ms
            tl.to(el, {
                y: -38,
                opacity: 0,
                duration: 0.29,
                ease: "power1.in",
            });
        } else {
            // Non-bonus: brief hold so the number lingers, then drift away.
            // Total still 750ms (130 + 70 + 150 hold + 400 drift).
            tl.to({}, { duration: 0.15 });
            tl.to(el, {
                y: -38,
                opacity: 0,
                duration: 0.4,
                ease: "power1.in",
            });
        }
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
            {isBonus && (
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
