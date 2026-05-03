import { useState } from "react";
import { joinGame, setGamePhase } from "../arkynStore";
import AchievementsModal from "./AchievementsModal";
import HowToPlayModal from "./HowToPlayModal";
import logoUrl from "/assets/logos/arkyn-logo.png?url";
import { INNER_FRAME_BGS } from "./styles";
import styles from "./MainMenu.module.css";

const playButtonStyleVars = {
    "--btn-bg": INNER_FRAME_BGS.green,
    "--btn-bg-hover": INNER_FRAME_BGS.green,
} as React.CSSProperties;

const howToPlayButtonStyleVars = {
    "--btn-bg": INNER_FRAME_BGS.blue,
    "--btn-bg-hover": INNER_FRAME_BGS.blue,
} as React.CSSProperties;

const achievementsButtonStyleVars = {
    "--btn-bg": INNER_FRAME_BGS.red,
    "--btn-bg-hover": INNER_FRAME_BGS.red,
} as React.CSSProperties;

function handlePlay() {
    setGamePhase("waiting");
    joinGame();
}

export default function MainMenu() {
    const [howToPlayOpen, setHowToPlayOpen] = useState(false);
    const [achievementsOpen, setAchievementsOpen] = useState(false);

    return (
        <div className={styles.root}>
            <img src={logoUrl} alt="Arkyn" className={styles.logo} draggable={false} />
            <div className={styles.buttonRow}>
                <button
                    type="button"
                    className={`${styles.menuButton} ${styles.playButton}`}
                    style={playButtonStyleVars}
                    onClick={handlePlay}
                >
                    Play
                </button>
                <button
                    type="button"
                    className={`${styles.menuButton} ${styles.howToPlayButton}`}
                    style={howToPlayButtonStyleVars}
                    onClick={() => setHowToPlayOpen(true)}
                >
                    How to Play
                </button>
                <button
                    type="button"
                    className={`${styles.menuButton} ${styles.howToPlayButton}`}
                    style={achievementsButtonStyleVars}
                    onClick={() => setAchievementsOpen(true)}
                >
                    Achievements
                </button>
            </div>
            {howToPlayOpen && <HowToPlayModal onClose={() => setHowToPlayOpen(false)} />}
            {achievementsOpen && <AchievementsModal onClose={() => setAchievementsOpen(false)} />}
        </div>
    );
}
