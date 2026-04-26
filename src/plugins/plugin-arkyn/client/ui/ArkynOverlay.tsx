import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
    useGamePhase,
    useIsCastAnimating,
    useSigils,
    onScrollPurchase,
    onSigilPurchase,
    onBagRunePick,
    onPackPurchase,
    getSigilSlotRect,
    setScrollUpgradeDisplay,
    setPendingSigilId,
    setPackAnimating,
} from "../arkynStore";
import type { ScrollPurchaseEvent, SigilPurchaseEvent, BagRunePickEvent, PackPurchaseEvent, RuneClientData } from "../arkynStore";
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
import BanishAnimation from "./BanishAnimation";
import BlackjackAnimation from "./BlackjackAnimation";
import MainMenu from "./MainMenu";
import SigilBar from "./SigilBar";
import ItemScene from "./ItemScene";
import MultBubbleOverlay from "./MultBubble";
import HeldXMultBubbleOverlay from "./HeldXMultBubble";
import InfoButton from "./InfoButton";
import BackgroundMusic from "./BackgroundMusic";
import BackgroundShader from "./BackgroundShader";
import PerfHud, { isPerfHudEnabled } from "./PerfHud";

// Evaluated once at module load — URL-param check is stable across the
// session. Writers who want to flip it have to reload anyway.
const PERF_HUD = isPerfHudEnabled();
import OverlayShader from "./OverlayShader";
import { getScrollImageUrl } from "./scrollAssets";
import { getSigilImageUrl } from "./sigilAssets";
import { getBaseRuneImageUrl, getRuneImageUrl } from "./runeAssets";
import DissolveCanvas from "./DissolveCanvas";
import { playCount, playDissolve } from "../sfx";
import "./shared-animations.css";
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

    // Flying sigil overlay — for the sigil purchase animation.
    const sigils = useSigils();
    const [flyingSigil, setFlyingSigil] = useState<{
        sigilId: string;
        imageUrl: string;
        fromRect: DOMRect;
        targetSlotIndex: number;
    } | null>(null);
    const flyingSigilRef = useRef<HTMLDivElement>(null);

    // Flying rune overlay — for the Rune Bag "picked rune flies to the
    // pouch counter" animation. Same pattern as flying sigil, but the
    // overlay wraps two <img>s (rarity base + element glyph) so the rune
    // keeps its RuneImage-stacked look in flight.
    const [flyingRune, setFlyingRune] = useState<{
        rune: RuneClientData;
        fromRect: DOMRect;
    } | null>(null);
    const flyingRuneRef = useRef<HTMLDivElement>(null);

    // Flying pack overlay — for the pack-buy fly-to-center + dissolve
    // animation that runs BEFORE the picker mounts. ShopScreen flips
    // `packAnimating` on at click time and we flip it off on cleanup,
    // gating the picker mount until the dissolve is done.
    const [flyingPack, setFlyingPack] = useState<{
        packId: string;
        imageUrl: string;
        fromRect: DOMRect;
        naturalAspect: number;
        dissolveElement: string;
    } | null>(null);
    const flyingPackRef = useRef<HTMLImageElement>(null);
    const [packDissolveData, setPackDissolveData] = useState<{
        imageUrl: string;
        element: string;
        startTime: number;
        x: number;
        y: number;
        width: number;
        height: number;
        bufSize: number;
    } | null>(null);

    // Dissolve phase — replaces the img with a WebGL dissolve canvas.
    const [dissolveData, setDissolveData] = useState<{
        element: string;
        startTime: number;
        x: number;
        y: number;
        size: number;
    } | null>(null);
    const DISSOLVE_DURATION_MS = 550;

    // "UPGRADE!" label — shown above the scroll after it reaches center.
    const [showUpgradeLabel, setShowUpgradeLabel] = useState(false);

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

    // Listen for sigil purchases and orchestrate the fly-to-bar animation.
    useEffect(() => {
        return onSigilPurchase((e: SigilPurchaseEvent) => {
            const imageUrl = getSigilImageUrl(e.sigilId, 128);
            if (!imageUrl) return;
            const targetSlotIndex = sigils.length;
            // Mark this sigil as in-flight so SigilBar hides its slot until
            // the flyer arrives; prevents the server echo from popping the
            // sigil into its slot mid-flight.
            setPendingSigilId(e.sigilId);
            setFlyingSigil({
                sigilId: e.sigilId,
                imageUrl,
                fromRect: e.fromRect,
                targetSlotIndex,
            });
        });
    }, [sigils.length]);

    // GSAP timeline for the flying sigil animation.
    useGSAP(() => {
        const el = flyingSigilRef.current;
        if (!el || !flyingSigil) return;

        const { fromRect, targetSlotIndex } = flyingSigil;
        const toRect = getSigilSlotRect(targetSlotIndex);
        // Fallback: fly to top-center if slot rect not available
        const toX = toRect ? toRect.left + toRect.width / 2 : window.innerWidth / 2;
        const toY = toRect ? toRect.top + toRect.height / 2 : 40;
        const toSize = toRect ? toRect.width : 60;

        // Keep width/height STATIC at the target size and tween scale +
        // translate. Animating width/height triggers layout every frame,
        // which stutters against the shared ItemScene render loop; scale
        // on a position:fixed element is compositor-only.
        const startScale = fromRect.width / toSize;
        const fromCenterX = fromRect.left + fromRect.width / 2;
        const fromCenterY = fromRect.top + fromRect.height / 2;

        gsap.set(el, {
            width: toSize,
            height: toSize,
            x: fromCenterX - toSize / 2,
            y: fromCenterY - toSize / 2,
            scale: startScale,
            autoAlpha: 1,
        });

        const tl = gsap.timeline();

        // Fly from shop card to the sigil bar slot
        tl.to(el, {
            x: toX - toSize / 2,
            y: toY - toSize / 2,
            scale: 1,
            duration: 0.45,
            ease: "power2.inOut",
        });

        // Reveal the sigil in its slot as the flyer lands — the 0.15s
        // fade below plays on top so the handoff is seamless.
        tl.call(() => { setPendingSigilId(null); });

        // Fade out in place once landed. autoAlpha flips visibility to
        // hidden at opacity 0 so the flyer skips paint + stops eating
        // layer memory.
        tl.to(el, { autoAlpha: 0, duration: 0.15, ease: "power2.in" });

        // Clean up
        tl.call(() => { setFlyingSigil(null); });

        return () => {
            tl.kill();
            // Safety: if the timeline is interrupted, don't leave the
            // slot permanently hidden.
            setPendingSigilId(null);
        };
    }, { dependencies: [flyingSigil] });

    // Listen for pack purchases and run the fly-to-center + dissolve
    // animation. ShopScreen has already flipped packAnimating on; we
    // flip it off in the timeline cleanup so the picker can slide in
    // exactly when the dissolve finishes.
    useEffect(() => {
        return onPackPurchase((e: PackPurchaseEvent) => {
            if (!e.imageUrl) {
                // No art for this pack — release the gate immediately so
                // the picker still mounts on the schema-sync.
                setPackAnimating(false);
                return;
            }
            setFlyingPack(e);
        });
    }, []);

    // GSAP timeline for the flying-pack animation. Mirrors the scroll
    // fly's intro phase but skips the shake/upgrade phases — packs just
    // fly in, briefly hold, dissolve, and release the picker gate.
    useGSAP(() => {
        const el = flyingPackRef.current;
        if (!el || !flyingPack) return;

        const { fromRect, imageUrl, dissolveElement, naturalAspect } = flyingPack;
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        // Fit-within-viewport box sized off the shorter viewport axis,
        // then derive width/height from the pack's natural aspect so
        // non-square art (Codex Pack 89x160) renders un-distorted.
        const maxSide = Math.min(window.innerWidth, window.innerHeight) * 0.22;
        const targetW = naturalAspect >= 1 ? maxSide : maxSide * naturalAspect;
        const targetH = naturalAspect >= 1 ? maxSide / naturalAspect : maxSide;

        const startScale = fromRect.width / targetW;
        const fromCenterX = fromRect.left + fromRect.width / 2;
        const fromCenterY = fromRect.top + fromRect.height / 2;

        gsap.set(el, {
            width: targetW,
            height: targetH,
            x: fromCenterX - targetW / 2,
            y: fromCenterY - targetH / 2,
            scale: startScale,
            autoAlpha: 1,
        });

        const tl = gsap.timeline();

        // Fade the shop panel out concurrent with the fly-to-center so
        // the dissolve plays in visual isolation.
        const shopEl = shopScreenRef.current;
        if (shopEl) {
            tl.to(shopEl, {
                opacity: 0,
                y: 30,
                duration: 0.25,
                ease: "power2.in",
            }, 0);
        }

        // Arrival overshoot — the pack pops slightly larger when it
        // reaches the center, then shakes and dissolves at that size.
        const arrivalScale = 1.2;
        const dissolveW = targetW * arrivalScale;
        const dissolveH = targetH * arrivalScale;

        // Phase 1: fly to center, end at scale 1 so the punch-up has
        // somewhere to overshoot to.
        tl.to(el, {
            x: centerX - targetW / 2,
            y: centerY - targetH / 2,
            scale: 1,
            duration: 0.4,
            ease: "power2.out",
        }, 0);

        // Phase 2: punch up to `arrivalScale` so the pack reads as
        // "landed" — back.out gives a tiny rebound without feeling
        // bouncy. CSS transform-origin defaults to center, so the
        // scale-up grows the pack symmetrically around its centerpoint.
        tl.to(el, {
            scale: arrivalScale,
            duration: 0.18,
            ease: "back.out(1.6)",
        });

        // Phase 3: subtle shake — diminishing rotation (±3° → 0). Same
        // diminishing-amplitude pattern the scroll upgrade uses, but
        // halved so it reads as a "shiver" rather than a hammer hit.
        // Last keyframe lands at rotation 0 so the dissolve swap
        // doesn't snap from a tilted img to a level canvas.
        tl.to(el, {
            keyframes: [
                { rotation: -3, duration: 0.05 },
                { rotation: 3, duration: 0.05 },
                { rotation: -2, duration: 0.05 },
                { rotation: 2, duration: 0.05 },
                { rotation: -1, duration: 0.05 },
                { rotation: 1, duration: 0.05 },
                { rotation: 0, duration: 0.05 },
            ],
        });

        // Phase 4: swap img for the WebGL dissolve canvas. The dissolve
        // shader renders into a square buffer (largest dimension) and
        // we let CSS scale it back to the pack's true rect — the
        // texture-stretch and CSS-squeeze cancel out so the image
        // displays at its natural aspect. The dissolve noise pattern
        // gets the same compensation, which is acceptable for the
        // brief 550ms reveal. We use the punched-up dimensions so the
        // dissolve picks up where the shake left off, not at the
        // pre-pop size.
        tl.call(() => {
            const cx = window.innerWidth / 2;
            const cy = window.innerHeight / 2;
            playDissolve();
            setPackDissolveData({
                imageUrl,
                element: dissolveElement,
                startTime: performance.now(),
                x: cx - dissolveW / 2,
                y: cy - dissolveH / 2,
                width: dissolveW,
                height: dissolveH,
                bufSize: Math.max(dissolveW, dissolveH),
            });
            el.style.visibility = "hidden";
        });

        // Wait for the dissolve to finish, then snap the shop screen
        // back to its default opacity AND release the picker gate. The
        // shop stays hidden through the entire fly + dissolve so the
        // player never sees a "shop reappears between dissolve and
        // picker" flash; ShopScreen recognizes the pack-fly→picker
        // transition (via its prevPackAnimating ref) and skips the
        // standard slide-out exit, going straight to the picker
        // entrance.
        tl.to(el, {
            duration: DISSOLVE_DURATION_MS / 1000 + 0.1,
            onComplete: () => {
                if (shopEl) gsap.set(shopEl, { opacity: 1, y: 0 });
                setFlyingPack(null);
                setPackAnimating(false);
                requestAnimationFrame(() => setPackDissolveData(null));
            },
        });

        return () => {
            tl.kill();
            // Safety: if the timeline is interrupted, don't leave the
            // picker permanently gated or the shop permanently faded.
            setPackAnimating(false);
            if (shopEl) gsap.set(shopEl, { opacity: 1, y: 0 });
        };
    }, { dependencies: [flyingPack] });

    // Listen for Rune Bag picks and fly the chosen rune to the pouch.
    useEffect(() => {
        return onBagRunePick((e: BagRunePickEvent) => {
            setFlyingRune({ rune: e.rune, fromRect: e.fromRect });
        });
    }, []);

    // GSAP timeline for the flying-rune animation. Fires once the img
    // ref is mounted. Target is the PouchCounter (data-pouch-counter).
    useGSAP(() => {
        const el = flyingRuneRef.current;
        if (!el || !flyingRune) return;

        const { fromRect } = flyingRune;
        const target = document.querySelector("[data-pouch-counter]") as HTMLElement | null;
        const toRect = target?.getBoundingClientRect();
        const toSize = toRect ? Math.min(toRect.width, toRect.height) * 0.8 : 40;
        const toX = toRect ? toRect.left + toRect.width / 2 : window.innerWidth - 60;
        const toY = toRect ? toRect.top + toRect.height / 2 : window.innerHeight - 60;

        // Static width/height at the target size; scale+translate tween
        // is compositor-only (avoids the per-frame layout cost that
        // width/height animation triggered during the 0.68s flight).
        const startScale = fromRect.width / toSize;
        const fromCenterX = fromRect.left + fromRect.width / 2;
        const fromCenterY = fromRect.top + fromRect.height / 2;
        const initialX = fromCenterX - toSize / 2;
        const initialY = fromCenterY - toSize / 2;

        gsap.set(el, {
            x: initialX,
            y: initialY,
            width: toSize,
            height: toSize,
            scale: startScale,
            autoAlpha: 1,
        });

        const tl = gsap.timeline();

        // Arc slightly up before diving toward the counter — feels more
        // like a thrown rune than a linear slide. (40px of lift is in
        // screen space; translate happens before scale in the transform
        // matrix, so the visual rise is 40px regardless of scale.)
        tl.to(el, {
            y: initialY - 40,
            duration: 0.18,
            ease: "power2.out",
        });
        tl.to(el, {
            x: toX - toSize / 2,
            y: toY - toSize / 2,
            scale: 1,
            duration: 0.5,
            ease: "power2.in",
        });
        // Land pop + fade.
        tl.to(el, { scale: 1.2, duration: 0.08, ease: "power2.out" });
        tl.to(el, { scale: 1, autoAlpha: 0, duration: 0.14, ease: "power2.in" });

        tl.call(() => { setFlyingRune(null); });

        return () => { tl.kill(); };
    }, { dependencies: [flyingRune] });

    // Clear animation state when leaving shop
    useEffect(() => {
        if (gamePhase !== "shop") {
            setFlyingScroll(null);
            setFlyingSigil(null);
            setFlyingRune(null);
            setFlyingPack(null);
            setPackDissolveData(null);
            setPackAnimating(false);
            setDissolveData(null);
            setShowUpgradeLabel(false);
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

        // Keep width/height STATIC at the target size and tween scale +
        // translate. Animating width/height triggers layout every frame
        // for the full 0.4s flight, which collides with the shared item
        // renderer's load — scale on a position:fixed element is
        // compositor-only.
        const startScale = fromRect.width / targetSize;
        const fromCenterX = fromRect.left + fromRect.width / 2;
        const fromCenterY = fromRect.top + fromRect.height / 2;

        gsap.set(el, {
            width: targetSize,
            height: targetSize,
            x: fromCenterX - targetSize / 2,
            y: fromCenterY - targetSize / 2,
            scale: startScale,
            autoAlpha: 1,
        });

        const tl = gsap.timeline();

        // Fade the shop panel out concurrent with the fly-to-center so the
        // upgrade animation plays in visual isolation — also prevents the
        // player from clicking another Buy mid-animation.
        const shopEl = shopScreenRef.current;
        if (shopEl) {
            tl.to(shopEl, {
                opacity: 0,
                y: 30,
                duration: 0.25,
                ease: "power2.in",
            }, 0);
        }

        // Phase 1: Fly to center + scale up (0.4s)
        tl.to(el, {
            x: centerX - targetSize / 2,
            y: centerY - targetSize / 2,
            scale: 1,
            duration: 0.4,
            ease: "power2.out",
        }, 0);

        // Show "UPGRADE!" label above the scroll
        tl.call(() => { setShowUpgradeLabel(true); });

        // Phase 2-4: For each level step, shake + display + hold. Default
        // scrolls grant +1 level → one iteration. Scroll God grants +2
        // levels → two iterations, where the player watches "+0 → +2"
        // commit, then the animation replays "+2 → +4".
        const steps = Math.max(1, newLevel - oldLevel);
        for (let i = 0; i < steps; i++) {
            const stepOldLevel = oldLevel + i;
            const stepNewLevel = stepOldLevel + 1;

            // Shake (0.35s)
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

            // Show upgrade display in ShopPanel + 3× count SFX
            tl.call(() => {
                setScrollUpgradeDisplay({ element, oldLevel: stepOldLevel, newLevel: stepNewLevel });
                playCount(1.0);
            });
            tl.call(() => { playCount(1.15); }, [], "+=0.15");
            tl.call(() => { playCount(1.3); }, [], "+=0.15");

            // Hold (0.5s) — let the player read the upgrade info
            tl.to(el, { duration: 0.5 });
        }

        // Phase 5: Swap img for WebGL dissolve shader
        tl.call(() => {
            const targetSize = Math.min(window.innerWidth, window.innerHeight) * 0.18;
            const cx = window.innerWidth / 2;
            const cy = window.innerHeight / 2;
            playDissolve();
            setShowUpgradeLabel(false);
            setDissolveData({
                element,
                startTime: performance.now(),
                x: cx - targetSize / 2,
                y: cy - targetSize / 2,
                size: targetSize,
            });
            // Hide the img — the dissolve canvas takes over
            el.style.visibility = "hidden";
        });

        // Fade the shop panel back in concurrent with the dissolve so the
        // shop is ready for interaction the moment the dissolve finishes.
        if (shopEl) {
            tl.to(shopEl, {
                opacity: 1,
                y: 0,
                duration: 0.3,
                ease: "power2.out",
            }, "<");
        }

        // Wait for dissolve to finish, then clean up. Extra 100ms buffer
        // so the canvas has fully hidden itself before React unmounts it
        // — prevents a white flash from the GL context teardown.
        // `setScrollUpgradeDisplay(null)` returns the ShopPanel's NEXT
        // ENEMY section to the live enemy preview — without this it
        // stays stuck on "Per Rune Bonus +N" for the rest of the shop
        // phase, since this flying-scroll animation is the only place
        // that calls setScrollUpgradeDisplay({...}) and there was no
        // matching clear at the end of the timeline.
        tl.to(el, {
            duration: DISSOLVE_DURATION_MS / 1000 + 0.1,
            onComplete: () => {
                setFlyingScroll(null);
                setScrollUpgradeDisplay(null);
                requestAnimationFrame(() => setDissolveData(null));
            },
        });

        return () => {
            tl.kill();
            // Guard against interruption (e.g. phase change) leaving the
            // shop mid-fade. Reset to fully visible so re-entry is clean.
            if (shopEl) gsap.set(shopEl, { opacity: 1, y: 0 });
        };
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
                // Read the CSS-resolved x (mobile applies a translateX
                // shift on the panel to match SpellPreview's positioning)
                // and land the entrance animation on THAT value instead of
                // a hardcoded 0. Hardcoding 0 would override the CSS
                // transform and park the shop panel 10-18px to the right
                // of where the round-phase SpellPreview sits on mobile.
                const cssX = gsap.getProperty(shopPanelRef.current, "x") as number;
                gsap.fromTo(shopPanelRef.current,
                    { x: -240, opacity: 0 },
                    { x: cssX, opacity: 1, duration: SCREEN_ENTER_DURATION_S, ease: "power2.out", overwrite: "auto" },
                );
            }
            if (shopScreenRef.current) {
                const cssX = gsap.getProperty(shopScreenRef.current, "x") as number;
                gsap.fromTo(shopScreenRef.current,
                    { x: 240, opacity: 0 },
                    { x: cssX, opacity: 1, duration: SCREEN_ENTER_DURATION_S, ease: "power2.out", overwrite: "auto" },
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
                <div className={`${styles.centerColumn} ${styles.centerColumnShop}`}>
                    <ShopScreen ref={shopScreenRef} />
                </div>
                <div className={styles.rightSpacer} aria-hidden="true" />
                <PouchCounter />
                <SigilBar />

                {/* Flying scroll animation overlay */}
                {flyingScroll && (
                    <img
                        ref={flyingScrollRef}
                        src={flyingScroll.imageUrl}
                        alt=""
                        className={styles.flyingScroll}
                    />
                )}

                {/* Flying sigil animation overlay — uses ItemScene so the
                    flyer shows the same framed/embossed look as the shop
                    card and destination slot, instead of a flat PNG. */}
                {flyingSigil && (
                    <div
                        ref={flyingSigilRef}
                        className={styles.flyingSigil}
                        aria-hidden="true"
                    >
                        <ItemScene
                            itemId={flyingSigil.sigilId}
                            index={-1}
                            className={styles.flyingSigilCard}
                        />
                    </div>
                )}

                {/* Flying rune animation overlay — for Rune Bag picks */}
                {flyingRune && (
                    <div
                        ref={flyingRuneRef}
                        className={styles.flyingRune}
                        aria-hidden="true"
                    >
                        <img src={getBaseRuneImageUrl(flyingRune.rune.rarity)} alt="" />
                        <img src={getRuneImageUrl(flyingRune.rune.element)} alt="" />
                    </div>
                )}

                {/* Flying pack animation overlay — fly-to-center prelude
                    that runs before the picker mounts. The img is hidden
                    once the dissolve canvas takes over. */}
                {flyingPack && (
                    <img
                        ref={flyingPackRef}
                        src={flyingPack.imageUrl}
                        alt=""
                        className={styles.flyingScroll}
                    />
                )}

                {/* Pack dissolve canvas — single-texture variant. The
                    underlying canvas buffer is square (`size`) but CSS
                    width/height reshape the visible canvas to the pack's
                    natural aspect, undoing the square texture stretch.
                    `objectFit: fill` overrides the .flyingScroll
                    `object-fit: contain` default — without it the
                    browser fits the canvas's intrinsic 1:1 buffer aspect
                    inside the rect and the dissolve appears square. */}
                {packDissolveData && (
                    <DissolveCanvas
                        element={packDissolveData.element}
                        imageUrl={packDissolveData.imageUrl}
                        startTime={packDissolveData.startTime}
                        duration={DISSOLVE_DURATION_MS}
                        size={packDissolveData.bufSize}
                        className={styles.flyingScroll}
                        style={{
                            left: packDissolveData.x,
                            top: packDissolveData.y,
                            width: packDissolveData.width,
                            height: packDissolveData.height,
                            objectFit: "fill",
                        }}
                    />
                )}

                {/* "UPGRADE!" label above the centered scroll */}
                {showUpgradeLabel && (
                    <span className={styles.upgradeLabel}>Upgrade!</span>
                )}

                {/* WebGL dissolve canvas — replaces the img for the final phase */}
                {dissolveData && (
                    <DissolveCanvas
                        element={dissolveData.element}
                        imageUrl={getScrollImageUrl(dissolveData.element)}
                        startTime={dissolveData.startTime}
                        duration={DISSOLVE_DURATION_MS}
                        size={dissolveData.size}
                        className={styles.flyingScroll}
                        style={{
                            left: dissolveData.x,
                            top: dissolveData.y,
                        }}
                    />
                )}

                <BackgroundMusic />
                <OverlayShader />
                {PERF_HUD && <PerfHud />}
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
            <SigilBar />
            <InfoButton />
            <CastAnimation />
            <DiscardAnimation />
            <BanishAnimation />
            <DrawAnimation />
            <MultBubbleOverlay />
            <HeldXMultBubbleOverlay />
            <BlackjackAnimation />
            <BackgroundMusic />
            {showRoundEnd && <RoundEndOverlay />}
            {showGameOver && <GameOverOverlay />}
            <OverlayShader />
            {PERF_HUD && <PerfHud />}
        </div>
    );
}
