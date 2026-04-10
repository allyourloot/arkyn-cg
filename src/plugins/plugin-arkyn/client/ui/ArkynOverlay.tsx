import { useEffect, useState } from "react";
import {
    useGamePhase,
    useIsCastAnimating,
} from "../arkynStore";
import { ENEMY_DAMAGE_HIT_MS } from "../arkynAnimations";
import EnemyHealthBar from "./EnemyHealthBar";
import SpellPreview from "./SpellPreview";
import PlayArea from "./PlayArea";
import HandDisplay from "./HandDisplay";
import ActionButtons from "./ActionButtons";
import PouchCounter from "./PouchCounter";
import RoundEndOverlay from "./RoundEndOverlay";
import GameOverOverlay from "./GameOverOverlay";
import CastAnimation from "./CastAnimation";
import DiscardAnimation from "./DiscardAnimation";
import DrawAnimation from "./DrawAnimation";
import MainMenu from "./MainMenu";
import BackgroundMusic from "./BackgroundMusic";
import BackgroundShader from "./BackgroundShader";
import OverlayShader from "./OverlayShader";
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

    // Same animation gate for the game-over overlay — wait for the final
    // cast animation and damage hit to finish so the player sees their
    // last spell's impact before the Game Over screen appears.
    const [showGameOver, setShowGameOver] = useState(false);
    useEffect(() => {
        if (gamePhase !== "game_over") {
            setShowGameOver(false);
            return;
        }
        if (isCastAnimating) return;
        const t = setTimeout(() => setShowGameOver(true), ENEMY_DAMAGE_HIT_MS);
        return () => clearTimeout(t);
    }, [gamePhase, isCastAnimating]);

    if (gamePhase === "menu") {
        return (
            <div className={styles.root}>
                <BackgroundShader />
                <BackgroundMusic />
                <MainMenu />
                <OverlayShader />
            </div>
        );
    }

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

            {/* Left side panel: Spell Preview (now also hosts the round
                label at its top and the gold counter at its bottom — see
                SpellPreview.tsx) */}
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

            {/* Right-side counterweight — mirrors SpellPreview's width so the
                centerColumn (flex:1 between two equal-width side columns)
                stays centered on the viewport now that EnemyPanel is gone. */}
            <div className={styles.rightSpacer} aria-hidden="true" />

            {/* Spellbook / pouch counter — anchored to the viewport's right
                edge at roughly hand level rather than tied to the hand's
                bounding box, so it sits in a stable spot regardless of how
                many cards are currently in the hand. */}
            <PouchCounter />

            {/* Animation layers */}
            <CastAnimation />
            <DiscardAnimation />
            <DrawAnimation />

            {/* Background music */}
            <BackgroundMusic />

            {/* Round End overlay — animated reward breakdown */}
            {showRoundEnd && <RoundEndOverlay />}

            {/* Game Over overlay — shown when the player exhausts all
                casts and discards without defeating the enemy. */}
            {showGameOver && <GameOverOverlay />}

            {/* Global pixel-art grain overlay — sits on top of every
                other layer (z-index 9999, pointer-events: none) and
                composites over the UI via mix-blend-mode: soft-light.
                Mounted last so it's the topmost child of .root. */}
            <OverlayShader />
        </div>
    );
}
