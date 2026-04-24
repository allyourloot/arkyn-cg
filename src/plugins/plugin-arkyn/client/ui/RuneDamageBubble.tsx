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
    /** Whether this rune hit a resistance — tints the number light red. */
    isResisted: boolean;
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
    /**
     * Variant selector. Default (`"damage"` / undefined) renders the
     * damage number with element-tinted stroke and optional critical /
     * resist treatments. `"gold"` renders "+N Gold" in the coin-yellow
     * color — used by Fortune-style grant_gold procs. Gold bubbles
     * ignore `isCritical` / `isResisted` (gold procs don't crit or resist).
     */
    kind?: "damage" | "gold";
}

const NORMAL_COLOR = "#ffffff";
const RESISTED_COLOR = "#f87171";
const CRITICAL_COLOR = "#fbbf24";
const GOLD_COLOR = "#ffcd3c";

export default function RuneDamageBubble({ baseAmount, spellElement, isCritical, isResisted, seq, delayMs, kind }: Props) {
    const bubbleRef = useRef<HTMLSpanElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);
    const criticalRef = useRef<HTMLImageElement>(null);
    const labelRef = useRef<HTMLSpanElement>(null);
    const isGold = kind === "gold";
    // Gold bubbles use a fixed gold stroke; damage bubbles tint to the spell's element.
    const strokeColor = isGold ? GOLD_COLOR : (ELEMENT_COLORS[spellElement] ?? "#ffffff");

    // Gold procs never show the critical burst or resist label — those are
    // damage-only concepts.
    const showCritical = isCritical && !isGold;
    const showResisted = isResisted && !isGold;
    const hasLabel = showCritical || showResisted;

    // Gold bubbles render "+N Gold"; damage bubbles render the raw number.
    const displayText = isGold ? `+${baseAmount} Gold` : String(baseAmount);
    // Choose base text color: white for damage, red tint for resist, gold for gold procs.
    const baseColor = isGold ? GOLD_COLOR : (showResisted ? RESISTED_COLOR : NORMAL_COLOR);

    useGSAP(() => {
        const el = bubbleRef.current;
        const textEl = textRef.current;
        const critEl = criticalRef.current;
        const labelEl = labelRef.current;
        if (!el) return;
        if (textEl) textEl.textContent = displayText;
        gsap.set(el, { xPercent: -50, y: 6, scale: 0.55, opacity: 0, color: baseColor });
        if (critEl) gsap.set(critEl, { opacity: 0, scale: 0.5, xPercent: -50, yPercent: -50 });
        if (labelEl) gsap.set(labelEl, { opacity: 0, y: 0, scale: 0.6 });

        const tl = gsap.timeline({ delay: delayMs / 1000 });

        // Phase 1: pop in (130ms)
        tl.to(el, {
            y: -10,
            scale: showCritical ? 1.38 : 1.18,
            opacity: 1,
            duration: 0.13,
            ease: showCritical ? "back.out(2.5)" : "back.out(2)",
        });

        // Critical burst pops in simultaneously with the number.
        if (critEl && showCritical) {
            tl.to(critEl, {
                opacity: 1,
                scale: 1,
                duration: 0.13,
                ease: "back.out(2.5)",
            }, "<");
        }

        // Descriptor label pops in with the number, then floats up and fades.
        if (labelEl && hasLabel) {
            tl.to(labelEl, {
                opacity: 1,
                y: -4,
                scale: 1,
                duration: 0.12,
                ease: "back.out(2)",
            }, "<");
            // Drift up and fade out
            tl.to(labelEl, {
                y: -22,
                opacity: 0,
                duration: 0.5,
                ease: "power1.out",
            }, ">+0.15");
        }

        // Phase 2: settle (70ms)
        tl.to(el, {
            y: -14,
            scale: showCritical ? 1.12 : 1,
            duration: 0.07,
            ease: "power2.out",
        }, hasLabel ? 0.13 + delayMs / 1000 : ">");

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
            {hasLabel && (
                <span
                    ref={labelRef}
                    className={styles.descriptorLabel}
                    style={{ color: showCritical ? CRITICAL_COLOR : RESISTED_COLOR }}
                >
                    {showCritical ? "CRITICAL!" : "RESIST!"}
                </span>
            )}
            {showCritical && (
                <img
                    ref={criticalRef}
                    src={criticalUrl}
                    alt=""
                    className={styles.criticalBg}
                />
            )}
            <span ref={textRef}>{displayText}</span>
        </span>
    );
}
