import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { arkynStoreInternal, useBlackjackAnimation } from "../arkynStore";
import styles from "./BlackjackAnimation.module.css";

// Eager-glob load the 13 Blackjack spritesheet frames at build time so
// Vite inlines them as resolved asset URLs. Filenames are bare integers
// (1.png..13.png); the sort is numeric (parseInt) so 10 doesn't land
// between 1 and 2 as it would with a lexicographic sort.
const frameModules = import.meta.glob("/assets/spritesheets/blackjack/*.png", {
    eager: true,
    query: "?url",
    import: "default",
}) as Record<string, string>;

const FRAME_URLS: string[] = Object.entries(frameModules)
    .map(([path, url]) => {
        const filename = path.split("/").pop() ?? "";
        const stem = filename.replace(".png", "");
        return { index: parseInt(stem, 10), url };
    })
    .filter(e => Number.isFinite(e.index))
    .sort((a, b) => a.index - b.index)
    .map(e => e.url);

// Per-frame hold in ms. 13 frames × 70ms ≈ 910ms — long enough to read
// as a distinct cinematic moment without stalling the enemy-defeat beat
// that follows on the killing blow.
const FRAME_DURATION_MS = 70;
// Fade-out duration after the last frame lands. Short enough to clear
// the screen before the enemy-defeat beat, long enough to feel like a
// deliberate dissolve rather than a hard cut.
const FADE_OUT_MS = 280;
// Scale-in punch on mount — the whole overlay pops from 0.85 → 1.0 over
// one frame hold. Keeps the first frame from feeling like a hard paste.
const SCALE_IN_DURATION_MS = 120;

// Total wall-clock duration from `triggerBlackjackAnimation()` until the
// fade-out tween completes and `clearBlackjackAnimation()` fires. Exported
// so the cast orchestrator can defer the floating-damage hit + HP drop
// until after the spritesheet finishes — keeps the kill reveal landing
// AFTER the cinematic instead of clipping under it.
export const BLACKJACK_ANIMATION_TOTAL_MS =
    FRAME_DURATION_MS * 13 + FADE_OUT_MS;

/**
 * Fullscreen-centered spritesheet overlay that plays when Blackjack's
 * execute proc fires. Cycles through 13 frames (1.png..13.png) via rAF
 * off the mount timestamp — so even if the tab stutters, frame advance
 * is driven by elapsed wall-clock time rather than setInterval drift.
 * After the last frame, a GSAP opacity fade runs for FADE_OUT_MS before
 * the store trigger is cleared and the component unmounts.
 *
 * Mount is driven by a monotonic `seq` so back-to-back procs (e.g. two
 * Death runes both rolling the 1-in-21) restart the animation from
 * frame 1 with a fresh fade timeline.
 *
 * The SFX is played by the cast timeline at the same moment this
 * component mounts (see `onExecuteProc` in arkynAnimations) — the
 * component is purely visual, no audio wiring here.
 */
export default function BlackjackAnimation() {
    const animation = useBlackjackAnimation();

    if (!animation) return null;
    return <BlackjackSpriteRunner key={animation.seq} />;
}

function BlackjackSpriteRunner() {
    const [frameIdx, setFrameIdx] = useState(0);
    const layerRef = useRef<HTMLDivElement>(null);

    // Frame cycling driven by requestAnimationFrame. Using elapsed wall-
    // clock time (not an interval tick count) means the animation stays
    // locked to real time even if the browser throttles or drops frames
    // — important because a stuck last frame is exactly the pause the
    // old setInterval version produced.
    useEffect(() => {
        if (FRAME_URLS.length === 0) {
            arkynStoreInternal.clearBlackjackAnimation();
            return;
        }

        const startTime = performance.now();
        let raf = 0;
        let lastIdx = -1;

        const tick = () => {
            const elapsed = performance.now() - startTime;
            const idx = Math.floor(elapsed / FRAME_DURATION_MS);
            if (idx >= FRAME_URLS.length - 1) {
                // Lock onto the final frame and stop the rAF loop — the
                // fade-out tween (below) owns visual updates from here.
                if (lastIdx !== FRAME_URLS.length - 1) {
                    setFrameIdx(FRAME_URLS.length - 1);
                }
                return;
            }
            if (idx !== lastIdx) {
                lastIdx = idx;
                setFrameIdx(idx);
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);

        return () => cancelAnimationFrame(raf);
    }, []);

    // Scale-in pop on mount + fade-out after the spritesheet finishes.
    // Both tween the same wrapper — the scale-in only runs for the first
    // SCALE_IN_DURATION_MS, the fade-out is scheduled to begin once the
    // final frame lands (FRAME_URLS.length * FRAME_DURATION_MS after
    // mount). onComplete clears the store trigger so the component
    // unmounts cleanly.
    useGSAP(() => {
        const el = layerRef.current;
        if (!el || FRAME_URLS.length === 0) return;

        gsap.set(el, { opacity: 1, scale: 0.85 });
        const tl = gsap.timeline({
            onComplete: () => arkynStoreInternal.clearBlackjackAnimation(),
        });
        tl.to(el, {
            scale: 1,
            duration: SCALE_IN_DURATION_MS / 1000,
            ease: "back.out(1.6)",
        }, 0);
        // Hold on the final frame briefly, then fade out. Start time =
        // full spritesheet run minus the overlap with the scale-in.
        const fadeStart = (FRAME_URLS.length * FRAME_DURATION_MS) / 1000;
        tl.to(el, {
            opacity: 0,
            scale: 1.05,
            duration: FADE_OUT_MS / 1000,
            ease: "power2.in",
        }, fadeStart);
    }, { dependencies: [], scope: layerRef });

    const frameUrl = FRAME_URLS[frameIdx];
    if (!frameUrl) return null;

    return (
        <div ref={layerRef} className={styles.layer}>
            <img
                src={frameUrl}
                alt=""
                className={styles.frame}
                draggable={false}
            />
        </div>
    );
}
