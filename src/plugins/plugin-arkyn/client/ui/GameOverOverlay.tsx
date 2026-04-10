import { useEffect } from "react";
import { useCurrentRound, sendNewRun } from "../arkynStore";
import { playMenuOpen } from "../sfx";
import { createPanelStyleVars } from "./styles";
import buttonGreenUrl from "/assets/ui/button-green.png?url";
import buttonGreenHoverUrl from "/assets/ui/button-green-hover.png?url";
import styles from "./GameOverOverlay.module.css";

const panelStyleVars = createPanelStyleVars();
const buttonStyleVars = {
    "--btn-bg": `url(${buttonGreenUrl})`,
    "--btn-bg-hover": `url(${buttonGreenHoverUrl})`,
} as React.CSSProperties;

export default function GameOverOverlay() {
    const currentRound = useCurrentRound();

    useEffect(() => {
        playMenuOpen();
    }, []);

    return (
        <div className={styles.backdrop}>
            <div
                className={styles.panel}
                style={panelStyleVars}
            >
                <span className={styles.title}>Game Over</span>

                <div className={styles.contentFrame}>
                    <span className={styles.stat}>
                        Reached Round <span className={styles.statValue}>{currentRound}</span>
                    </span>
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
