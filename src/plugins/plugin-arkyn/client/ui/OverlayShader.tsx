import { useEffect, useRef } from "react";
import { FRAGMENT_SHADER, VERTEX_SHADER } from "./OverlayShader.frag";
import { createProgram } from "./utils/glProgram";
import styles from "./OverlayShader.module.css";

// Each shader pixel becomes a PIXEL_SIZE×PIXEL_SIZE block on screen after
// the CSS nearest-neighbor upscale — same chunky pixel-art look the
// BackgroundShader uses. Larger = grainier and cheaper.
const PIXEL_SIZE = 3;

/**
 * Global pixel-art grain overlay. Renders a static noise + Bayer dither
 * pattern as a translucent fixed-position canvas above every other UI
 * layer in the Arkyn overlay (z-index 9999, pointer-events none) and
 * uses `mix-blend-mode: soft-light` to gently lift / darken the
 * underlying UI without obscuring it.
 *
 * Cheap to run: the shader is fully static (no `uTime` term), so the
 * canvas is rendered exactly once on mount and again on each viewport
 * resize. No requestAnimationFrame loop, no per-frame uniform updates.
 */
export default function OverlayShader() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // alpha: true so the backbuffer is transparent and the CSS
        // blend-mode can composite the grain over the UI below.
        const gl = canvas.getContext("webgl", { antialias: false, alpha: true });
        if (!gl) {
            console.warn("WebGL not available; UI grain overlay disabled.");
            return;
        }

        const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER, "overlay-grain");
        if (!program) return;
        gl.useProgram(program);

        // Fullscreen quad as a triangle strip — same shape as the
        // BackgroundShader.
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

        // Render at 1/PIXEL_SIZE of the viewport size; CSS upscales the
        // canvas with nearest-neighbor for the chunky pixel-art look.
        // Re-renders on every resize so the grain pattern keeps the same
        // visual scale across viewport size changes.
        const renderOnce = () => {
            const w = Math.max(1, Math.floor(canvas.clientWidth / PIXEL_SIZE));
            const h = Math.max(1, Math.floor(canvas.clientHeight / PIXEL_SIZE));
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
                gl.viewport(0, 0, w, h);
            }
            gl.uniform2f(uResolution, canvas.width, canvas.height);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        };
        renderOnce();

        const onResize = () => renderOnce();
        window.addEventListener("resize", onResize);

        return () => {
            window.removeEventListener("resize", onResize);
            gl.deleteBuffer(buffer);
            gl.deleteProgram(program);
        };
    }, []);

    return <canvas ref={canvasRef} className={styles.canvas} />;
}
