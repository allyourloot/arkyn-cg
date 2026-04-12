import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
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
import ShopPanel from "./ShopPanel";
import ShopScreen from "./ShopScreen";
import CastAnimation from "./CastAnimation";
import DiscardAnimation from "./DiscardAnimation";
import DrawAnimation from "./DrawAnimation";
import MainMenu from "./MainMenu";
import InfoButton from "./InfoButton";
import BackgroundMusic from "./BackgroundMusic";
import BackgroundShader from "./BackgroundShader";
import OverlayShader from "./OverlayShader";
import styles from "./ArkynOverlay.module.css";

// Normalizes the raw gamePhase into one of the four visual layouts the
// overlay actually has to render. round_end and game_over are overlays
// painted on top of the playing layout, so they collapse to "playing".
type DisplayPhase = "menu" | "waiting" | "shop" | "playing";
function toDisplayPhase(gamePhase: string): DisplayPhase {
    if (gamePhase === "menu") return "menu";
    if (gamePhase === "waiting") return "waiting";
    if (gamePhase === "shop") return "shop";
    return "playing";
}

// Screen transition timing. Fast + snappy — just enough to register as
// an intentional slide rather than a hard layout swap.
const SCREEN_EXIT_DURATION_S = 0.22;
const SCREEN_ENTER_DURATION_S = 0.32;

export default function ArkynOverlay() {
    const gamePhase = useGamePhase();
    const isCastAnimating = useIsCastAnimating();
    const displayPhase = toDisplayPhase(gamePhase);

    // renderedPhase lags displayPhase during an exit animation so React
    // keeps the outgoing sections mounted while GSAP slides them offscreen.
    // Once the exit timeline completes we flip renderedPhase to the new
    // value, React swaps the tree, and useGSAP kicks off the entrance.
    const [renderedPhase, setRenderedPhase] = useState<DisplayPhase>(displayPhase);

    // Refs for the animated sections. Each gets attached on mount via the
    // ref-as-prop pattern (React 19). Null when the corresponding layout
    // isn't currently rendered.
    const spellPreviewRef = useRef<HTMLDivElement>(null);
    const enemyHealthBarRef = useRef<HTMLDivElement>(null);
    const handStackRef = useRef<HTMLDivElement>(null);
    const shopPanelRef = useRef<HTMLDivElement>(null);
    const shopScreenRef = useRef<HTMLDivElement>(null);

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

    // Drive the exit animation when displayPhase diverges from renderedPhase.
    // We slide out the outgoing sections, then flip renderedPhase to swap
    // the rendered tree. The entrance animation is handled separately by
    // the useGSAP hook below.
    useEffect(() => {
        if (displayPhase === renderedPhase) return;

        // Menu/waiting transitions don't have the sliding sections, so
        // skip the exit timeline and swap immediately.
        if (renderedPhase === "menu" || renderedPhase === "waiting") {
            setRenderedPhase(displayPhase);
            return;
        }

        const tl = gsap.timeline({
            onComplete: () => setRenderedPhase(displayPhase),
        });

        if (renderedPhase === "playing") {
            if (spellPreviewRef.current) {
                tl.to(spellPreviewRef.current, {
                    y: -120, opacity: 0,
                    duration: SCREEN_EXIT_DURATION_S, ease: "power2.in",
                }, 0);
            }
            if (enemyHealthBarRef.current) {
                tl.to(enemyHealthBarRef.current, {
                    y: -80, opacity: 0,
                    duration: SCREEN_EXIT_DURATION_S, ease: "power2.in",
                }, 0);
            }
            if (handStackRef.current) {
                tl.to(handStackRef.current, {
                    y: 160, opacity: 0,
                    duration: SCREEN_EXIT_DURATION_S, ease: "power2.in",
                }, 0);
            }
        } else if (renderedPhase === "shop") {
            if (shopPanelRef.current) {
                tl.to(shopPanelRef.current, {
                    x: -240, opacity: 0,
                    duration: SCREEN_EXIT_DURATION_S, ease: "power2.in",
                }, 0);
            }
            if (shopScreenRef.current) {
                tl.to(shopScreenRef.current, {
                    x: 240, opacity: 0,
                    duration: SCREEN_EXIT_DURATION_S, ease: "power2.in",
                }, 0);
            }
        }

        // Safety net: if the timeline has no targets (all refs null), it
        // completes synchronously on the next tick but we also force-swap
        // after the expected duration in case onComplete never fires.
        return () => {
            tl.kill();
        };
    }, [displayPhase, renderedPhase]);

    // Entrance animation for the newly rendered phase. Fires whenever
    // renderedPhase updates (which happens after the exit timeline
    // completes, so the incoming elements are freshly mounted).
    useGSAP(() => {
        if (renderedPhase === "playing") {
            if (spellPreviewRef.current) {
                gsap.fromTo(spellPreviewRef.current,
                    { y: -120, opacity: 0 },
                    {
                        y: 0, opacity: 1,
                        duration: SCREEN_ENTER_DURATION_S,
                        ease: "power2.out",
                        overwrite: "auto",
                    },
                );
            }
            if (enemyHealthBarRef.current) {
                gsap.fromTo(enemyHealthBarRef.current,
                    { y: -80, opacity: 0 },
                    {
                        y: 0, opacity: 1,
                        duration: SCREEN_ENTER_DURATION_S,
                        ease: "power2.out",
                        overwrite: "auto",
                    },
                );
            }
            if (handStackRef.current) {
                gsap.fromTo(handStackRef.current,
                    { y: 160, opacity: 0 },
                    {
                        y: 0, opacity: 1,
                        duration: SCREEN_ENTER_DURATION_S,
                        ease: "power2.out",
                        overwrite: "auto",
                    },
                );
            }
        } else if (renderedPhase === "shop") {
            if (shopPanelRef.current) {
                gsap.fromTo(shopPanelRef.current,
                    { x: -240, opacity: 0 },
                    {
                        x: 0, opacity: 1,
                        duration: SCREEN_ENTER_DURATION_S,
                        ease: "power2.out",
                        overwrite: "auto",
                    },
                );
            }
            if (shopScreenRef.current) {
                gsap.fromTo(shopScreenRef.current,
                    { x: 240, opacity: 0 },
                    {
                        x: 0, opacity: 1,
                        duration: SCREEN_ENTER_DURATION_S,
                        ease: "power2.out",
                        overwrite: "auto",
                    },
                );
            }
        }
    }, { dependencies: [renderedPhase] });

    if (renderedPhase === "menu") {
        return (
            <div className={styles.root}>
                <BackgroundShader />
                <BackgroundMusic />
                <MainMenu />
                <OverlayShader />
            </div>
        );
    }

    if (renderedPhase === "waiting") {
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

    if (renderedPhase === "shop") {
        return (
            <div className={styles.root}>
                {/* Background image (behind everything) — the shader reads
                    `gamePhase` and tweens its palette toward the blue/green
                    shop look while we're here. */}
                <BackgroundShader />

                {/* Left side panel: Shop variant of SpellPreview's shell. */}
                <ShopPanel ref={shopPanelRef} />

                {/* Center column: shop frame sits alone — no enemy bar,
                    no hand, no action buttons. */}
                <div className={styles.centerColumn}>
                    <ShopScreen ref={shopScreenRef} />
                </div>

                {/* Right counterweight — keep in sync with SpellPreview's
                    width so the center column stays centered. */}
                <div className={styles.rightSpacer} aria-hidden="true" />

                <BackgroundMusic />

                {/* Global pixel-art grain overlay — mirrors the combat
                    layout so the shop doesn't lose the UI grain texture. */}
                <OverlayShader />
            </div>
        );
    }

    return (
        <div className={styles.root}>
            {/* Background image (behind everything) */}
            <BackgroundShader />

            {/* Left side panel: Spell Preview (now also hosts the round
                label at its top and the gold counter at its bottom — see
                SpellPreview.tsx) */}
            <SpellPreview ref={spellPreviewRef} />

            {/* Center column: Enemy health bar, Play area, Hand + Actions */}
            <div className={styles.centerColumn}>
                <EnemyHealthBar ref={enemyHealthBarRef} />

                <div className={styles.centerStage}>
                    <PlayArea />
                </div>

                <div ref={handStackRef} className={styles.handStack}>
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

            {/* Info button — top-right corner, opens a modal with synergy
                and spell tier reference information. */}
            <InfoButton />

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
