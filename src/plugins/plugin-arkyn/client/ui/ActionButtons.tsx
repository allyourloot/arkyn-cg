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
import circleFrameUrl from "/assets/ui/circle-frame.png?url";
import sortIconUrl from "/assets/icons/sort-128x128.png?url";
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
    const canSort = isPlaying && hand.length > 1;

    const handleSort = () => {
        sortHand();
        playPlaceRune();
    };

    return (
        <div className={styles.bar}>
            <div className={styles.group}>
                <button
                    onClick={castSpell}
                    disabled={!canCast}
                    className={`${styles.button} ${styles.cast}`}
                    style={castStateVars}
                >
                    Cast <span className={styles.countBadge} style={{ backgroundImage: `url(${circleFrameUrl})` }}>{castsRemaining}</span>
                </button>
                <button
                    onClick={discardRunes}
                    disabled={!canDiscard}
                    className={`${styles.button} ${styles.discard}`}
                    style={discardStateVars}
                >
                    Discard <span className={styles.countBadge} style={{ backgroundImage: `url(${circleFrameUrl})` }}>{discardsRemaining}</span>
                </button>
                <button
                    onClick={handleSort}
                    disabled={!canSort}
                    className={styles.sortButton}
                    aria-label="Sort hand"
                >
                    <img src={sortIconUrl} alt="Sort" className={styles.sortIcon} />
                </button>
            </div>
        </div>
    );
}
