import type { CSSProperties } from "react";
import { useCurrentRound } from "../arkynStore";
import innerFrameOrangeUrl from "/assets/ui/inner-frame-orange.png?url";
import styles from "./RoundInfo.module.css";

// Self-contained orange inner-frame chrome — wires up `--round-info-bg`
// on the wrapper so RoundInfo's CSS module can pick its own 9-slice
// background instead of inheriting `--section-bg` from the parent panel.
const wrapperStyle: CSSProperties = {
    ["--round-info-bg" as string]: `url(${innerFrameOrangeUrl})`,
};

export default function RoundInfo() {
    const round = useCurrentRound();

    if (round <= 0) return null;

    return (
        <div className={styles.wrapper} style={wrapperStyle}>
            <span className={styles.label}>Round {round}</span>
        </div>
    );
}
