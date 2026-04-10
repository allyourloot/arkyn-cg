import { joinGame } from "../arkynStore";
import { setGamePhase } from "../arkynStore";
import logoUrl from "/assets/logos/arkyn-logo.png?url";
import buttonGreenUrl from "/assets/ui/button-green.png?url";
import buttonGreenHoverUrl from "/assets/ui/button-green-hover.png?url";
import styles from "./MainMenu.module.css";

const buttonStyleVars = {
    "--btn-bg": `url(${buttonGreenUrl})`,
    "--btn-bg-hover": `url(${buttonGreenHoverUrl})`,
} as React.CSSProperties;

function handlePlay() {
    setGamePhase("waiting");
    joinGame();
}

export default function MainMenu() {
    return (
        <div className={styles.root}>
            <img src={logoUrl} alt="Arkyn" className={styles.logo} draggable={false} />
            <button
                type="button"
                className={styles.playButton}
                style={buttonStyleVars}
                onClick={handlePlay}
            >
                Play
            </button>
        </div>
    );
}
