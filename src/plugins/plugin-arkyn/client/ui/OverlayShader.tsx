import { useEffect, useRef } from "react";
import styles from "./OverlayShader.module.css";

// Each rendered pixel becomes a PIXEL_SIZE×PIXEL_SIZE block on screen
// after the CSS nearest-neighbor upscale — same chunky pixel-art look the
// BackgroundShader uses. Larger = grainier and cheaper.
const PIXEL_SIZE = 3;

// 4×4 Bayer ordered dither matrix (same values as the GLSL bayer4 helper),
// pre-divided by 16 so lookups are a bare float between 0 and 1.
const BAYER4 = [
    0 / 16, 8 / 16, 2 / 16, 10 / 16,
    12 / 16, 4 / 16, 14 / 16, 6 / 16,
    3 / 16, 11 / 16, 1 / 16, 9 / 16,
    15 / 16, 7 / 16, 13 / 16, 5 / 16,
];

// GLSL `fract(x) = x - floor(x)`.
function fract(x: number): number {
    return x - Math.floor(x);
}

/**
 * Global pixel-art grain overlay. Renders a static noise + Bayer dither
 * pattern as a translucent fixed-position canvas above every other UI
 * layer (z-index 9999, pointer-events none) and uses
 * `mix-blend-mode: soft-light` to gently lift / darken the underlying UI
 * without obscuring it.
 *
 * Previously implemented with a tiny WebGL shader; since the pattern is
 * fully static (no `uTime` term, no animation), we render the same
 * grain + dither math via Canvas2D + `putImageData` once on mount and
 * again on each viewport resize. This drops one WebGL context off the
 * global budget, which matters when multiple dissolve canvases + sigil
 * cards + the background shader all fight for context slots.
 *
 * Visual output is a gray noise field centered around 0.5 (the soft-light
 * no-op midpoint) with the same multipliers as the GLSL version, so the
 * rendered grain is perceptually identical — only the underlying pixel
 * values may vary within a few bits due to `Math.sin` precision at large
 * arguments (well below the 18% opacity + soft-light blend noise floor).
 */
export default function OverlayShader() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            console.warn("Canvas2D not available; UI grain overlay disabled.");
            return;
        }

        // Render at 1/PIXEL_SIZE of the viewport size; CSS upscales the
        // canvas with nearest-neighbor for the chunky pixel-art look. Re-
        // runs on every resize so the grain pattern keeps the same visual
        // scale across viewport changes.
        const renderOnce = () => {
            const w = Math.max(1, Math.floor(canvas.clientWidth / PIXEL_SIZE));
            const h = Math.max(1, Math.floor(canvas.clientHeight / PIXEL_SIZE));
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
            }

            const imageData = ctx.createImageData(w, h);
            const data = imageData.data;

            for (let y = 0; y < h; y++) {
                const bayerRow = (y & 3) * 4;
                for (let x = 0; x < w; x++) {
                    // Static per-pixel grain — identical math to the GLSL
                    // `hash(gl_FragCoord.xy) - 0.5` term.
                    const hash = fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
                    const grain = hash - 0.5;

                    // Bayer 4×4 ordered dither — adds a subtle high-frequency
                    // repeating texture so flat regions still get a tiny bit
                    // of break-up.
                    const dither = BAYER4[bayerRow + (x & 3)] - 0.5;

                    // Combine (biased toward the random grain) and offset
                    // around 0.5 — the soft-light no-op midpoint. Same
                    // multipliers as the GLSL version.
                    const intensity = grain * 0.32 + dither * 0.10;
                    const gray = Math.max(0, Math.min(255, Math.round((0.5 + intensity) * 255)));

                    const idx = (y * w + x) * 4;
                    data[idx] = gray;
                    data[idx + 1] = gray;
                    data[idx + 2] = gray;
                    data[idx + 3] = 255;
                }
            }

            ctx.putImageData(imageData, 0, 0);
        };
        renderOnce();

        const onResize = () => renderOnce();
        window.addEventListener("resize", onResize);
        return () => {
            window.removeEventListener("resize", onResize);
        };
    }, []);

    return <canvas ref={canvasRef} className={styles.canvas} />;
}
