import { useEffect, useRef } from "react";
import { FRAGMENT_SHADER, VERTEX_SHADER } from "./BackgroundShader.frag";
import { createProgram } from "./utils/glProgram";
import styles from "./BackgroundShader.module.css";

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
const HAS_HOVER =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: hover)").matches;

const PIXEL_SIZE = HAS_HOVER ? 3 : 5;
const FRAME_INTERVAL_MS = HAS_HOVER ? 0 : 1000 / 30;

export default function BackgroundShader() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
        if (!gl) {
            console.warn("WebGL not available; background shader disabled.");
            return;
        }

        const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER, "background");
        if (!program) return;
        gl.useProgram(program);

        // Fullscreen quad as a triangle strip.
        const positions = new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
             1,  1,
        ]);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        const aPosition = gl.getAttribLocation(program, "aPosition");
        gl.enableVertexAttribArray(aPosition);
        gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

        const uResolution = gl.getUniformLocation(program, "uResolution");
        const uTime = gl.getUniformLocation(program, "uTime");

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

        // requestAnimationFrame still ticks at the display refresh rate,
        // but we skip drawing if we're inside the throttle window. On
        // desktop FRAME_INTERVAL_MS is 0 (no throttle), on mobile it's
        // ~33ms which gives a stable 30fps cap.
        const render = (now: number) => {
            if (!running) return;
            if (FRAME_INTERVAL_MS > 0 && now - lastDrawAt < FRAME_INTERVAL_MS) {
                rafId = requestAnimationFrame(render);
                return;
            }
            lastDrawAt = now;
            resize();
            const t = (now - start) / 1000;
            gl.uniform2f(uResolution, canvas.width, canvas.height);
            gl.uniform1f(uTime, t);
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
                rafId = requestAnimationFrame(render);
            }
        };
        document.addEventListener("visibilitychange", onVisibility);

        return () => {
            running = false;
            cancelAnimationFrame(rafId);
            window.removeEventListener("resize", resize);
            document.removeEventListener("visibilitychange", onVisibility);
            gl.deleteBuffer(buffer);
            gl.deleteProgram(program);
        };
    }, []);

    return <canvas ref={canvasRef} className={styles.canvas} />;
}
