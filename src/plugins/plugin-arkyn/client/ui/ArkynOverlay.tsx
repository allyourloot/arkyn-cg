import { useGamePhase, useLastSpellName, useLastDamage, sendReady } from "../arkynStore";
import EnemyHealthBar from "./EnemyHealthBar";
import SpellPreview from "./SpellPreview";
import PlayArea from "./PlayArea";
import EnemyPanel from "./EnemyPanel";
import HandDisplay from "./HandDisplay";
import ActionButtons from "./ActionButtons";
import RoundInfo from "./RoundInfo";
import PouchCounter from "./PouchCounter";
import CastAnimation from "./CastAnimation";
import DiscardAnimation from "./DiscardAnimation";
import DrawAnimation from "./DrawAnimation";
import BackgroundMusic from "./BackgroundMusic";
import BackgroundShader from "./BackgroundShader";
import styles from "./ArkynOverlay.module.css";

export default function ArkynOverlay() {
    const gamePhase = useGamePhase();
    const lastSpellName = useLastSpellName();
    const lastDamage = useLastDamage();

    if (gamePhase === "waiting") {
        return (
            <>
                <BackgroundShader />
                <BackgroundMusic />
                <div className={styles.waitingRoot}>
                    Connecting...
                </div>
            </>
        );
    }

    return (
        <div className={styles.root}>
            {/* Background image (behind everything) */}
            <BackgroundShader />

            {/* Round info (top-left) */}
            <RoundInfo />

            {/* Pouch counter (bottom-right) */}
            <PouchCounter />

            {/* Left side panel: Spell Preview */}
            <SpellPreview />

            {/* Center column: Enemy health bar, Play area, Hand + Actions */}
            <div className={styles.centerColumn}>
                <EnemyHealthBar />

                <div className={styles.centerStage}>
                    <PlayArea />
                </div>

                <div className={styles.handStack}>
                    <HandDisplay />
                    <ActionButtons />
                </div>
            </div>

            {/* Right side panel: Enemy Panel */}
            <EnemyPanel />

            {/* Animation layers */}
            <CastAnimation />
            <DiscardAnimation />
            <DrawAnimation />

            {/* Background music */}
            <BackgroundMusic />

            {/* Round End overlay */}
            {gamePhase === "round_end" && (
                <div className={styles.roundEnd}>
                    <span className={styles.roundEndTitle}>
                        Enemy Defeated!
                    </span>
                    {lastSpellName && (
                        <span className={styles.roundEndSubtitle}>
                            Final blow: {lastSpellName} for {lastDamage} damage
                        </span>
                    )}
                    <button
                        onClick={sendReady}
                        className={styles.roundEndButton}
                    >
                        Continue
                    </button>
                </div>
            )}
        </div>
    );
}
