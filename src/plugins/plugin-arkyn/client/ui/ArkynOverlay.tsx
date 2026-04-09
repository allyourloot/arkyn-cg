import { useEffect, useState } from "react";
import {
    useGamePhase,
    useIsCastAnimating,
} from "../arkynStore";
import { ENEMY_DAMAGE_HIT_MS } from "../arkynAnimations";
import EnemyHealthBar from "./EnemyHealthBar";
import SpellPreview from "./SpellPreview";
import PlayArea from "./PlayArea";
import EnemyPanel from "./EnemyPanel";
import HandDisplay from "./HandDisplay";
import ActionButtons from "./ActionButtons";
import RoundInfo from "./RoundInfo";
import PouchCounter from "./PouchCounter";
import GoldCounter from "./GoldCounter";
import RoundEndOverlay from "./RoundEndOverlay";
import CastAnimation from "./CastAnimation";
import DiscardAnimation from "./DiscardAnimation";
import DrawAnimation from "./DrawAnimation";
import BackgroundMusic from "./BackgroundMusic";
import BackgroundShader from "./BackgroundShader";
import styles from "./ArkynOverlay.module.css";

export default function ArkynOverlay() {
    const gamePhase = useGamePhase();
    const isCastAnimating = useIsCastAnimating();

    // The server flips gamePhase to "round_end" the instant the killing-blow
    // cast is processed (~500ms in), but the client cast animation needs to
    // finish — settle, raise, bubbles, dissolve, then the enemy floating
    // damage hit — before the "Enemy Defeated!" overlay appears. We hold the
    // overlay until isCastAnimating clears (which fires the damage hit) and
    // wait one more ENEMY_DAMAGE_HIT_MS for the floating number to play out.
    const [showRoundEnd, setShowRoundEnd] = useState(false);
    useEffect(() => {
        if (gamePhase !== "round_end") {
            setShowRoundEnd(false);
            return;
        }
        if (isCastAnimating) return;
        const t = setTimeout(() => setShowRoundEnd(true), ENEMY_DAMAGE_HIT_MS);
        return () => clearTimeout(t);
    }, [gamePhase, isCastAnimating]);

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

            {/* Gold counter (top-right) */}
            <GoldCounter />

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

            {/* Round End overlay — animated reward breakdown */}
            {showRoundEnd && <RoundEndOverlay />}
        </div>
    );
}
