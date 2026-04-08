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
}

export default function RuneDamageBubble({ amount, spellElement, seq }: Props) {
    const strokeColor = ELEMENT_COLORS[spellElement] ?? "#ffffff";
    // CSS variable lets the stylesheet apply -webkit-text-stroke without
    // hard-coding the color. The cast keeps TS happy about custom props.
    const style = { "--stroke-color": strokeColor } as CSSProperties;
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
