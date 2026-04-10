import { useEffect } from "react";
import {
    useCurrentRound,
    sendNewRun,
    useRunTotalDamage,
    useRunTotalCasts,
    useRunTotalDiscards,
    useRunHighestSingleCast,
    useRunFavoriteSpell,
    useRunEnemiesDefeated,
    useRunGoldEarned,
    useBestRound,
    useBestSingleCast,
} from "../arkynStore";
import { playGameOver } from "../sfx";
import { setBgMusicPlaybackRate } from "./BackgroundMusic";
import { createPanelStyleVars } from "./styles";
import buttonGreenUrl from "/assets/ui/button-green.png?url";
import buttonGreenHoverUrl from "/assets/ui/button-green-hover.png?url";
import styles from "./GameOverOverlay.module.css";

const panelStyleVars = createPanelStyleVars();
const buttonStyleVars = {
    "--btn-bg": `url(${buttonGreenUrl})`,
    "--btn-bg-hover": `url(${buttonGreenHoverUrl})`,
} as React.CSSProperties;

function NewBest() {
    return <span className={styles.newBest}>New Best!</span>;
}

export default function GameOverOverlay() {
    const currentRound = useCurrentRound();
    const totalDamage = useRunTotalDamage();
    const totalCasts = useRunTotalCasts();
    const totalDiscards = useRunTotalDiscards();
    const highestSingleCast = useRunHighestSingleCast();
    const favoriteSpell = useRunFavoriteSpell();
    const enemiesDefeated = useRunEnemiesDefeated();
    const goldEarned = useRunGoldEarned();
    const bestRound = useBestRound();
    const bestSingleCast = useBestSingleCast();

    const isNewBestRound = currentRound > bestRound;
    const isNewBestCast = highestSingleCast > 0 && highestSingleCast > bestSingleCast;

    useEffect(() => {
        playGameOver();
        setBgMusicPlaybackRate(0.82);
        return () => setBgMusicPlaybackRate(1);
    }, []);

    return (
        <div className={styles.backdrop}>
            <div
                className={styles.panel}
                style={panelStyleVars}
            >
                <span className={styles.title}>Game Over</span>

                <div className={styles.statChip}>
                    <span className={styles.statLabel}>Round Reached</span>
                    <span className={isNewBestRound ? styles.statValueBest : styles.statValue}>{currentRound}</span>
                    {isNewBestRound && <NewBest />}
                </div>

                <div className={styles.statsRow}>
                    <div className={styles.statChip}>
                        <span className={styles.statLabel}>Total Damage</span>
                        <span className={styles.statValue}>{totalDamage.toLocaleString()}</span>
                    </div>
                    <div className={styles.statChip}>
                        <span className={styles.statLabel}>Enemies Slain</span>
                        <span className={styles.statValue}>{enemiesDefeated}</span>
                    </div>
                </div>

                <div className={styles.statsRow}>
                    <div className={styles.statChip}>
                        <span className={styles.statLabel}>Spells Cast</span>
                        <span className={styles.statValue}>{totalCasts}</span>
                    </div>
                    <div className={styles.statChip}>
                        <span className={styles.statLabel}>Discards Used</span>
                        <span className={styles.statValue}>{totalDiscards}</span>
                    </div>
                </div>

                <div className={styles.statChip}>
                    <span className={styles.statLabel}>Best Single Cast</span>
                    <span className={isNewBestCast ? styles.statValueBest : styles.statValue}>{highestSingleCast.toLocaleString()}</span>
                    {isNewBestCast && <NewBest />}
                </div>

                {favoriteSpell && (
                    <div className={styles.statChip}>
                        <span className={styles.statLabel}>Favorite Spell</span>
                        <span className={styles.statValue}>{favoriteSpell}</span>
                    </div>
                )}

                <div className={styles.statChip}>
                    <span className={styles.statLabel}>Gold Earned</span>
                    <span className={styles.statValue}>{goldEarned}</span>
                </div>

                <button
                    type="button"
                    onClick={sendNewRun}
                    className={styles.button}
                    style={buttonStyleVars}
                >
                    New Run
                </button>
            </div>
        </div>
    );
}
