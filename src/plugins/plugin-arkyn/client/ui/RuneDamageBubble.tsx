import type { CSSProperties } from "react";
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
     * the CSS keyframe animation cleanly.
     */
    seq: number;
    /**
     * Milliseconds of CSS animation-delay before this bubble appears.
     * Used to stagger bubbles across contributing runes so they read
     * like a counter ticking up.
     */
    delayMs: number;
}

export default function RuneDamageBubble({ amount, spellElement, seq, delayMs }: Props) {
    const strokeColor = ELEMENT_COLORS[spellElement] ?? "#ffffff";
    // CSS variable lets the stylesheet apply -webkit-text-stroke without
    // hard-coding the color. Cast keeps TS happy about custom props.
    const style: CSSProperties = {
        ["--stroke-color" as string]: strokeColor,
        animationDelay: `${delayMs}ms`,
    };
    return (
        <span
            key={seq}
            className={styles.bubble}
            style={style}
        >
            {amount}
        </span>
    );
}
