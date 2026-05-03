import {
    useSelectedIndices,
    useGamePhase,
    useCastsRemaining,
    useDiscardsRemaining,
    castSpell,
    discardRunes,
} from "../arkynStore";
import { haptic, HAPTIC_MEDIUM } from "../haptics";
import { INNER_FRAME_BGS } from "./styles";
import styles from "./ActionButtons.module.css";

const castStateVars = {
    "--btn-bg": INNER_FRAME_BGS.green,
    "--btn-bg-hover": INNER_FRAME_BGS.green,
    "--btn-bg-disabled": INNER_FRAME_BGS.green,
} as React.CSSProperties;

const discardStateVars = {
    "--btn-bg": INNER_FRAME_BGS.orange,
    "--btn-bg-hover": INNER_FRAME_BGS.orange,
    "--btn-bg-disabled": INNER_FRAME_BGS.orange,
} as React.CSSProperties;

export default function ActionButtons() {
    const selectedIndices = useSelectedIndices();
    const gamePhase = useGamePhase();
    const castsRemaining = useCastsRemaining();
    const discardsRemaining = useDiscardsRemaining();

    const hasSelection = selectedIndices.length > 0;
    const isPlaying = gamePhase === "playing";
    const canCast = hasSelection && isPlaying && castsRemaining > 0;
    const canDiscard = hasSelection && isPlaying && discardsRemaining > 0;

    return (
        <div className={styles.bar}>
            <div className={styles.group}>
                <button
                    onClick={() => { haptic(HAPTIC_MEDIUM); castSpell(); }}
                    disabled={!canCast}
                    className={`${styles.button} ${styles.cast}`}
                    style={castStateVars}
                >
                    Cast
                </button>
                <button
                    onClick={() => { haptic(HAPTIC_MEDIUM); discardRunes(); }}
                    disabled={!canDiscard}
                    className={`${styles.button} ${styles.discard}`}
                    style={discardStateVars}
                >
                    Discard
                </button>
            </div>
        </div>
    );
}
