import { useEffect, useRef, useState, useCallback } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
    useGamePhase,
    useIsCastAnimating,
    onScrollPurchase,
    setScrollUpgradeDisplay,
} from "../arkynStore";
import type { ScrollPurchaseEvent } from "../arkynStore";
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
import { getScrollImageUrl } from "./scrollAssets";
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

/** Data for the flying scroll animation overlay. */
interface FlyingScroll {
    element: string;
    imageUrl: string;
    fromRect: DOMRect;
    oldLevel: number;
    newLevel: number;
}

export default function ArkynOverlay() {
    const gamePhase = useGamePhase();
    const isCastAnimating = useIsCastAnimating();
    const displayPhase = toDisplayPhase(gamePhase);

    // renderedPhase lags displayPhase during an exit animation so React
    // keeps the outgoing sections mounted while GSAP slides them offscreen.
    const [renderedPhase, setRenderedPhase] = useState<DisplayPhase>(displayPhase);

    // Refs for the animated sections.
    const spellPreviewRef = useRef<HTMLDivElement>(null);
    const enemyHealthBarRef = useRef<HTMLDivElement>(null);
    const handStackRef = useRef<HTMLDivElement>(null);
    const shopPanelRef = useRef<HTMLDivElement>(null);
    const shopScreenRef = useRef<HTMLDivElement>(null);

    // Flying scroll overlay — for the scroll purchase animation.
    const [flyingScroll, setFlyingScroll] = useState<FlyingScroll | null>(null);
    const flyingScrollRef = useRef<HTMLImageElement>(null);

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

    // Listen for scroll purchases and orchestrate the animation.
    useEffect(() => {
        return onScrollPurchase((e: ScrollPurchaseEvent) => {
            const imageUrl = getScrollImageUrl(e.element);
            if (!imageUrl) return;
            setFlyingScroll({
                element: e.element,
                imageUrl,
                fromRect: e.fromRect,
                oldLevel: e.oldLevel,
                newLevel: e.newLevel,
            });
        });
    }, []);

    // Clear animation state when leaving shop
    useEffect(() => {
        if (gamePhase !== "shop") {
            setFlyingScroll(null);
            setScrollUpgradeDisplay(null);
        }
    }, [gamePhase]);

    // GSAP timeline for the flying scroll animation. Fires when
    // flyingScroll mounts and the img ref is available.
    useGSAP(() => {
        const el = flyingScrollRef.current;
        if (!el || !flyingScroll) return;

        const { fromRect, oldLevel, newLevel, element } = flyingScroll;
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const targetSize = Math.min(window.innerWidth, window.innerHeight) * 0.18;

        // Set initial position at the card's scroll image location
        gsap.set(el, {
            x: fromRect.left + fromRect.width / 2 - targetSize / 2,
            y: fromRect.top + fromRect.height / 2 - targetSize / 2,
            width: fromRect.width,
            height: fromRect.height,
            opacity: 1,
        });

        const tl = gsap.timeline();

        // Phase 1: Fly to center + scale up (0.4s)
        tl.to(el, {
            x: centerX - targetSize / 2,
            y: centerY - targetSize / 2,
            width: targetSize,
            height: targetSize,
            duration: 0.4,
            ease: "power2.out",
        });

        // Phase 2: Shake (0.35s)
        tl.to(el, {
            keyframes: [
                { rotation: -6, duration: 0.05 },
                { rotation: 6, duration: 0.05 },
                { rotation: -4, duration: 0.05 },
                { rotation: 4, duration: 0.05 },
                { rotation: -2, duration: 0.05 },
                { rotation: 2, duration: 0.05 },
                { rotation: 0, duration: 0.05 },
            ],
        });

        // Phase 3: Show upgrade display in ShopPanel
        tl.call(() => {
            setScrollUpgradeDisplay({ element, oldLevel, newLevel });
        });

        // Phase 4: Hold (0.8s) — let the player read the upgrade info
        tl.to(el, { duration: 0.8 });

        // Phase 5: Dissolve — scale down + fade + blur
        tl.to(el, {
            opacity: 0,
            scale: 0.6,
            filter: "blur(8px) brightness(2)",
            duration: 0.5,
            ease: "power2.in",
            onComplete: () => {
                setFlyingScroll(null);
            },
        });

        return () => { tl.kill(); };
    }, { dependencies: [flyingScroll] });

    // Drive the exit animation when displayPhase diverges from renderedPhase.
    useEffect(() => {
        if (displayPhase === renderedPhase) return;

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

        return () => { tl.kill(); };
    }, [displayPhase, renderedPhase]);

    // Entrance animation for the newly rendered phase.
    useGSAP(() => {
        if (renderedPhase === "playing") {
            if (spellPreviewRef.current) {
                gsap.fromTo(spellPreviewRef.current,
                    { y: -120, opacity: 0 },
                    { y: 0, opacity: 1, duration: SCREEN_ENTER_DURATION_S, ease: "power2.out", overwrite: "auto" },
                );
            }
            if (enemyHealthBarRef.current) {
                gsap.fromTo(enemyHealthBarRef.current,
                    { y: -80, opacity: 0 },
                    { y: 0, opacity: 1, duration: SCREEN_ENTER_DURATION_S, ease: "power2.out", overwrite: "auto" },
                );
            }
            if (handStackRef.current) {
                gsap.fromTo(handStackRef.current,
                    { y: 160, opacity: 0 },
                    { y: 0, opacity: 1, duration: SCREEN_ENTER_DURATION_S, ease: "power2.out", overwrite: "auto" },
                );
            }
        } else if (renderedPhase === "shop") {
            if (shopPanelRef.current) {
                gsap.fromTo(shopPanelRef.current,
                    { x: -240, opacity: 0 },
                    { x: 0, opacity: 1, duration: SCREEN_ENTER_DURATION_S, ease: "power2.out", overwrite: "auto" },
                );
            }
            if (shopScreenRef.current) {
                gsap.fromTo(shopScreenRef.current,
                    { x: 240, opacity: 0 },
                    { x: 0, opacity: 1, duration: SCREEN_ENTER_DURATION_S, ease: "power2.out", overwrite: "auto" },
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
                <BackgroundShader />
                <ShopPanel ref={shopPanelRef} />
                <div className={styles.centerColumn}>
                    <ShopScreen ref={shopScreenRef} />
                </div>
                <div className={styles.rightSpacer} aria-hidden="true" />

                {/* Flying scroll animation overlay */}
                {flyingScroll && (
                    <img
                        ref={flyingScrollRef}
                        src={flyingScroll.imageUrl}
                        alt=""
                        className={styles.flyingScroll}
                    />
                )}

                <BackgroundMusic />
                <OverlayShader />
            </div>
        );
    }

    return (
        <div className={styles.root}>
            <BackgroundShader />
            <SpellPreview ref={spellPreviewRef} />
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
            <div className={styles.rightSpacer} aria-hidden="true" />
            <PouchCounter />
            <InfoButton />
            <CastAnimation />
            <DiscardAnimation />
            <DrawAnimation />
            <BackgroundMusic />
            {showRoundEnd && <RoundEndOverlay />}
            {showGameOver && <GameOverOverlay />}
            <OverlayShader />
        </div>
    );
}
