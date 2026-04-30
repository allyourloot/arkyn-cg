import { useState } from "react";
import { joinGame, setGamePhase } from "../arkynStore";
import HowToPlayModal from "./HowToPlayModal";
import logoUrl from "/assets/logos/arkyn-logo.png?url";
import buttonGreenUrl from "/assets/ui/button-green.png?url";
import buttonGreenHoverUrl from "/assets/ui/button-green-hover.png?url";
import buttonOrangeUrl from "/assets/ui/button-orange.png?url";
import buttonOrangeHoverUrl from "/assets/ui/button-orange-hover.png?url";
import styles from "./MainMenu.module.css";

const playButtonStyleVars = {
    "--btn-bg": `url(${buttonGreenUrl})`,
    "--btn-bg-hover": `url(${buttonGreenHoverUrl})`,
} as React.CSSProperties;

const howToPlayButtonStyleVars = {
    "--btn-bg": `url(${buttonOrangeUrl})`,
    "--btn-bg-hover": `url(${buttonOrangeHoverUrl})`,
} as React.CSSProperties;

function handlePlay() {
    setGamePhase("waiting");
    joinGame();
}

export default function MainMenu() {
    const [howToPlayOpen, setHowToPlayOpen] = useState(false);

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
            </div>
            {howToPlayOpen && <HowToPlayModal onClose={() => setHowToPlayOpen(false)} />}
        </div>
    );
}
