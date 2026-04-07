import {
    useSelectedIndices,
    useGamePhase,
    useCastsRemaining,
    useDiscardsRemaining,
    castSpell,
    discardRunes,
} from "../arkynStore";
import styles from "./ActionButtons.module.css";

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
            <button
                onClick={castSpell}
                disabled={!canCast}
                className={`${styles.button} ${styles.cast}`}
            >
                Cast ({castsRemaining})
            </button>
            <button
                onClick={discardRunes}
                disabled={!canDiscard}
                className={`${styles.button} ${styles.discard}`}
            >
                Discard ({discardsRemaining})
            </button>
        </div>
    );
}
