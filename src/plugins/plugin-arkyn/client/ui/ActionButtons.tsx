import {
    useHand,
    useSelectedIndices,
    useGamePhase,
    useCastsRemaining,
    useDiscardsRemaining,
    castSpell,
    discardRunes,
    sortHand,
} from "../arkynStore";
import { playPlaceRune } from "../sfx";
import buttonGreenUrl from "/assets/ui/button-green.png?url";
import buttonGreenHoverUrl from "/assets/ui/button-green-hover.png?url";
import buttonGreenDisabledUrl from "/assets/ui/button-green-disabled.png?url";
import buttonOrangeUrl from "/assets/ui/button-orange.png?url";
import buttonOrangeHoverUrl from "/assets/ui/button-orange-hover.png?url";
import buttonOrangeDisabledUrl from "/assets/ui/button-orange-disabled.png?url";
import styles from "./ActionButtons.module.css";

const castStateVars = {
    "--btn-bg": `url(${buttonGreenUrl})`,
    "--btn-bg-hover": `url(${buttonGreenHoverUrl})`,
    "--btn-bg-disabled": `url(${buttonGreenDisabledUrl})`,
} as React.CSSProperties;

const discardStateVars = {
    "--btn-bg": `url(${buttonOrangeUrl})`,
    "--btn-bg-hover": `url(${buttonOrangeHoverUrl})`,
    "--btn-bg-disabled": `url(${buttonOrangeDisabledUrl})`,
} as React.CSSProperties;

export default function ActionButtons() {
    const hand = useHand();
    const selectedIndices = useSelectedIndices();
    const gamePhase = useGamePhase();
    const castsRemaining = useCastsRemaining();
    const discardsRemaining = useDiscardsRemaining();

    const hasSelection = selectedIndices.length > 0;
    const isPlaying = gamePhase === "playing";
    const canCast = hasSelection && isPlaying && castsRemaining > 0;
    const canDiscard = hasSelection && isPlaying && discardsRemaining > 0;
    // Sort needs at least 2 cards to do anything visible. Stays usable
    // even with no selection (it's a UI utility, not a game action).
    const canSort = isPlaying && hand.length > 1;

    const handleSort = () => {
        sortHand();
        playPlaceRune();
    };

    return (
        <div className={styles.bar}>
            <button
                onClick={castSpell}
                disabled={!canCast}
                className={`${styles.button} ${styles.cast}`}
                style={castStateVars}
            >
                Cast ({castsRemaining})
            </button>
            <button
                onClick={discardRunes}
                disabled={!canDiscard}
                className={`${styles.button} ${styles.discard}`}
                style={discardStateVars}
            >
                Discard ({discardsRemaining})
            </button>
            <button
                onClick={handleSort}
                disabled={!canSort}
                className={`${styles.button} ${styles.sort}`}
                style={discardStateVars}
            >
                Sort
            </button>
        </div>
    );
}
