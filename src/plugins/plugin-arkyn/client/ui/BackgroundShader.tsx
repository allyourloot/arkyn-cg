import { useEffect, useRef } from "react";
import { useGamePhase, useEnemyIsBoss, usePendingPackRunes, usePendingCodexScrolls, usePendingAuguryRunes, usePendingAuguryTarots } from "../arkynStore";
import { FRAGMENT_SHADER, VERTEX_SHADER } from "./BackgroundShader.frag";
import {
    bindQuadAttributes,
    createContextLossHandler,
    createProgram,
    createQuadBuffer,
} from "./utils/glProgram";
import { HAS_HOVER } from "./utils/hasHover";
import styles from "./BackgroundShader.module.css";

// Seconds to tween the shop-mode uniform between 0 and 1 when the player
// enters / leaves the shop. Short enough to feel responsive, long enough
// to read as a deliberate mood shift rather than a hard cut.
const SHOP_MODE_TWEEN_S = 0.6;

// Each rendered shader pixel becomes a PIXEL_SIZE x PIXEL_SIZE block on screen
// after the CSS nearest-neighbor upscale. Larger = chunkier pixels and cheaper
// fragment shader.
//
// Touch devices get a much chunkier internal resolution + 30fps cap. Combined
// that's roughly a 5x reduction in shader work (≈2.8x fewer pixels at
// PIXEL_SIZE 5 vs 3, plus 2x fewer frames at 30 vs 60fps) — large enough to
// stop the shader from competing with React for the main thread on phones.
// The aesthetic stays the same: it's already a pixel-art look, the blocks
// just get a touch chunkier.
const PIXEL_SIZE = HAS_HOVER ? 3 : 5;
const FRAME_INTERVAL_MS = HAS_HOVER ? 0 : 1000 / 30;

export default function BackgroundShader() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const gamePhase = useGamePhase();
    const isBoss = useEnemyIsBoss();
    const pendingPackRunes = usePendingPackRunes();
    const pendingCodexScrolls = usePendingCodexScrolls();
    const pendingAuguryRunes = usePendingAuguryRunes();
    const pendingAuguryTarots = usePendingAuguryTarots();
    // Live-tweened mode values written into uniforms each frame by the
    // render loop. `current` is the displayed value, `target` is where
    // we're easing toward. Refs (not state) so updating them doesn't
    // re-run the GL setup effect. Each pack picker has its own ref so
    // the palette tweens cleanly between pack types if a player skips
    // straight from one picker into another.
    const shopModeRef = useRef({ current: 0, target: 0 });
    const bossModeRef = useRef({ current: 0, target: 0 });
    const runePackModeRef = useRef({ current: 0, target: 0 });
    const codexModeRef = useRef({ current: 0, target: 0 });
    const auguryModeRef = useRef({ current: 0, target: 0 });

    // Flip the targets whenever the game phase / boss state changes.
    useEffect(() => {
        shopModeRef.current.target = gamePhase === "shop" ? 1 : 0;
    }, [gamePhase]);

    useEffect(() => {
        // Show boss palette during active play and on the game-over screen
        // (so the red atmosphere persists if the player lost on a boss round).
        const bossActive = isBoss && (gamePhase === "playing" || gamePhase === "round_end" || gamePhase === "game_over");
        bossModeRef.current.target = bossActive ? 1 : 0;
    }, [isBoss, gamePhase]);

    // Per-pack palette modes — each fires when its picker is open.
    // Mutually exclusive on the server, so at most one of the three
    // targets is 1 at any moment. Each clears automatically when the
    // player picks or skips.
    //   Rune Pack   → dark/light greens
    //   Codex Pack  → dark/light blues
    //   Augury Pack → magenta/dark purples
    useEffect(() => {
        runePackModeRef.current.target = pendingPackRunes.length > 0 ? 1 : 0;
    }, [pendingPackRunes.length]);

    useEffect(() => {
        codexModeRef.current.target = pendingCodexScrolls.length > 0 ? 1 : 0;
    }, [pendingCodexScrolls.length]);

    useEffect(() => {
        const open = pendingAuguryRunes.length > 0 || pendingAuguryTarots.length > 0;
        auguryModeRef.current.target = open ? 1 : 0;
    }, [pendingAuguryRunes.length, pendingAuguryTarots.length]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // `alpha: true` so the canvas is transparent where WebGL doesn't
        // paint — critical for graceful degradation. If the browser's
        // WebGL context limit is exceeded elsewhere (e.g. many sigil
        // ItemScenes + dissolve canvases during a cast) and this context
        // is evicted, the canvas becomes transparent and the CSS
        // `background-color: #1a1530` fallback shows through instead of
        // flashing to default white.
        const gl = canvas.getContext("webgl", { antialias: false, alpha: true });
        if (!gl) {
            console.warn("WebGL not available; background shader disabled.");
            return;
        }

        // Pause the render loop when the context is lost so we don't spam
        // the console with errors. The canvas's CSS fallback takes over
        // visually. If the context is later restored, we don't currently
        // re-initialize — a reload or phase change would fix it.
        let contextLost = false;
        const disposeContextLossHandler = createContextLossHandler(canvas, {
            onLoss: () => {
                contextLost = true;
                console.warn("BackgroundShader: WebGL context lost — using CSS fallback background.");
            },
            onRestore: () => {
                contextLost = false;
                console.info("BackgroundShader: WebGL context restored.");
            },
        });

        const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER, "background");
        if (!program) return;
        gl.useProgram(program);

        const buffer = createQuadBuffer(gl, false);
        bindQuadAttributes(gl, program, false);

        const uResolution = gl.getUniformLocation(program, "uResolution");
        const uTime = gl.getUniformLocation(program, "uTime");
        const uShopMode = gl.getUniformLocation(program, "uShopMode");
        const uBossMode = gl.getUniformLocation(program, "uBossMode");
        const uRunePackMode = gl.getUniformLocation(program, "uRunePackMode");
        const uCodexMode = gl.getUniformLocation(program, "uCodexMode");
        const uAuguryMode = gl.getUniformLocation(program, "uAuguryMode");

        // Render at 1/PIXEL_SIZE of the viewport size; CSS upscales the
        // canvas with nearest-neighbor for the chunky pixel-art look.
        const resize = () => {
            const w = Math.max(1, Math.floor(canvas.clientWidth / PIXEL_SIZE));
            const h = Math.max(1, Math.floor(canvas.clientHeight / PIXEL_SIZE));
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
                gl.viewport(0, 0, w, h);
            }
        };
        resize();
        window.addEventListener("resize", resize);

        let rafId = 0;
        let running = true;
        const start = performance.now();
        let lastDrawAt = 0;
        let lastFrameAt = start;

        // requestAnimationFrame still ticks at the display refresh rate,
        // but we skip drawing if we're inside the throttle window. On
        // desktop FRAME_INTERVAL_MS is 0 (no throttle), on mobile it's
        // ~33ms which gives a stable 30fps cap.
        const render = (now: number) => {
            if (!running) return;
            // Skip drawing while the context is lost — the CSS fallback
            // background covers the canvas until the context is restored
            // or the component remounts.
            if (contextLost) {
                rafId = requestAnimationFrame(render);
                return;
            }
            if (FRAME_INTERVAL_MS > 0 && now - lastDrawAt < FRAME_INTERVAL_MS) {
                rafId = requestAnimationFrame(render);
                return;
            }
            // Ease each mode value toward its target at a rate that
            // covers the full 0→1 range in SHOP_MODE_TWEEN_S seconds.
            // Linear is fine here — the shader's palette mix absorbs any
            // would-be easing and the shift is brief.
            const dtS = Math.max(0, (now - lastFrameAt) / 1000);
            lastFrameAt = now;
            const tweenStep = dtS / SHOP_MODE_TWEEN_S;
            const tweenMode = (m: { current: number; target: number }) => {
                if (m.current === m.target) return;
                if (m.current < m.target) m.current = Math.min(m.target, m.current + tweenStep);
                else m.current = Math.max(m.target, m.current - tweenStep);
            };
            tweenMode(shopModeRef.current);
            tweenMode(bossModeRef.current);
            tweenMode(runePackModeRef.current);
            tweenMode(codexModeRef.current);
            tweenMode(auguryModeRef.current);
            lastDrawAt = now;
            resize();
            const t = (now - start) / 1000;
            gl.uniform2f(uResolution, canvas.width, canvas.height);
            gl.uniform1f(uTime, t);
            gl.uniform1f(uShopMode, shopModeRef.current.current);
            gl.uniform1f(uBossMode, bossModeRef.current.current);
            gl.uniform1f(uRunePackMode, runePackModeRef.current.current);
            gl.uniform1f(uCodexMode, codexModeRef.current.current);
            gl.uniform1f(uAuguryMode, auguryModeRef.current.current);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            rafId = requestAnimationFrame(render);
        };
        rafId = requestAnimationFrame(render);

        // Pause when the tab is hidden so we don't burn battery in the background.
        const onVisibility = () => {
            if (document.hidden) {
                running = false;
                cancelAnimationFrame(rafId);
            } else if (!running) {
                running = true;
                // Reset the frame timestamp so the tween dt doesn't include
                // however long the tab was hidden — otherwise resuming
                // would snap the shop-mode value to its target in one frame.
                lastFrameAt = performance.now();
                rafId = requestAnimationFrame(render);
            }
        };
        document.addEventListener("visibilitychange", onVisibility);

        return () => {
            running = false;
            cancelAnimationFrame(rafId);
            window.removeEventListener("resize", resize);
            document.removeEventListener("visibilitychange", onVisibility);
            disposeContextLossHandler();
            if (!contextLost) {
                gl.deleteBuffer(buffer);
                gl.deleteProgram(program);
            }
        };
    }, []);

    return <canvas ref={canvasRef} className={styles.canvas} />;
}
