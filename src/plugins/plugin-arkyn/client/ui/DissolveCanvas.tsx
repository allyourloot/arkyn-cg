import { useEffect, useRef } from "react";
import { ELEMENT_COLORS } from "./styles";
import {
    DISSOLVE_FRAGMENT_SHADER,
    DISSOLVE_FRAGMENT_SHADER_SINGLE,
    DISSOLVE_VERTEX_SHADER,
} from "./DissolveShader.frag";
import {
    createProgram,
    createQuadBuffer,
    bindQuadAttributes,
    configureTexture,
    cleanupGL,
} from "./utils/glProgram";
import { hexToRgbTriple } from "./utils/color";
import styles from "./DissolveShader.module.css";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DissolveCanvasProps {
    /** Element name — used to look up the edge-glow color. */
    element: string;
    /** performance.now() timestamp when the dissolve started. */
    startTime: number;
    /** Total dissolve duration in milliseconds. */
    duration: number;

    // --- Dual-texture mode (runes) ---
    /** Image URLs for the two-layer rune composite. */
    rune?: { baseUrl: string; runeUrl: string };

    // --- Single-texture mode (scrolls / items) ---
    /** Image URL for single-texture dissolves. */
    imageUrl?: string;

    /** Explicit CSS pixel size. Omit for 100% fill (rune slot mode). */
    size?: number;

    className?: string;
    style?: React.CSSProperties;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DissolveCanvas({
    element,
    startTime,
    duration,
    rune,
    imageUrl,
    size,
    className,
    style,
}: DissolveCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDual = !!rune;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const gl = canvas.getContext("webgl", {
            alpha: true,
            premultipliedAlpha: false,
            antialias: false,
        });
        if (!gl) {
            console.warn("DissolveCanvas: WebGL unavailable, skipping dissolve animation.");
            return;
        }

        const fragShader = isDual
            ? DISSOLVE_FRAGMENT_SHADER
            : DISSOLVE_FRAGMENT_SHADER_SINGLE;
        const program = createProgram(
            gl,
            DISSOLVE_VERTEX_SHADER,
            fragShader,
            isDual ? "dissolve" : "dissolve-single",
        );
        if (!program) return;
        gl.useProgram(program);

        const buffer = createQuadBuffer(gl);
        bindQuadAttributes(gl, program);

        // Uniforms.
        const uThreshold = gl.getUniformLocation(program, "uThreshold");
        const uEdgeColor = gl.getUniformLocation(program, "uEdgeColor");

        const [er, eg, eb] = hexToRgbTriple(ELEMENT_COLORS[element] ?? "#ffffff");
        gl.uniform3f(uEdgeColor, er, eg, eb);

        // ---- Texture loading ----
        const images: HTMLImageElement[] = [];
        const textures: (WebGLTexture | null)[] = [];
        let loaded = 0;
        let expectedCount: number;

        const loadTex = (url: string): WebGLTexture | null => {
            const tex = gl.createTexture();
            textures.push(tex);
            const img = new Image();
            images.push(img);
            img.onload = () => {
                configureTexture(gl, tex);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
                loaded++;
            };
            img.src = url;
            return tex;
        };

        if (isDual) {
            const baseTex = loadTex(rune.baseUrl);
            const runeTex = loadTex(rune.runeUrl);
            gl.uniform1i(gl.getUniformLocation(program, "uBaseTex"), 0);
            gl.uniform1i(gl.getUniformLocation(program, "uRuneTex"), 1);
            expectedCount = 2;

            // Store refs for render loop.
            var dualTexBase = baseTex;   // eslint-disable-line no-var
            var dualTexRune = runeTex;   // eslint-disable-line no-var
        } else {
            loadTex(imageUrl!);
            gl.uniform1i(gl.getUniformLocation(program, "uTex"), 0);
            expectedCount = 1;
        }

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Canvas sizing.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const pxSize = size ?? 96;
        canvas.width = pxSize * dpr;
        canvas.height = pxSize * dpr;
        gl.viewport(0, 0, canvas.width, canvas.height);

        // ---- Animation loop ----
        let rafId = 0;
        const render = () => {
            const elapsed = performance.now() - startTime;
            const t = Math.min(1, Math.max(0, elapsed / duration));

            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            if (loaded >= expectedCount) {
                if (isDual) {
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, dualTexBase!);
                    gl.activeTexture(gl.TEXTURE1);
                    gl.bindTexture(gl.TEXTURE_2D, dualTexRune!);
                } else {
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, textures[0]);
                }
                gl.uniform1f(uThreshold, t);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }

            if (t < 1) {
                rafId = requestAnimationFrame(render);
            } else {
                canvas.style.visibility = "hidden";
                canvas.style.display = "none";
            }
        };
        rafId = requestAnimationFrame(render);

        // ---- Cleanup ----
        return () => {
            cancelAnimationFrame(rafId);
            canvas.style.visibility = "hidden";
            canvas.style.display = "none";
            canvas.style.opacity = "0";
            // Clear handlers before cancelling src to prevent the in-flight
            // load from firing onload into a torn-down GL context.
            for (const img of images) {
                img.onload = null;
                img.src = "";
            }
            // Defer GL teardown by two frames so the hidden canvas is
            // fully removed from the render tree before loseContext().
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    cleanupGL(gl, { textures, buffers: [buffer], programs: [program] });
                });
            });
        };
    }, [element, startTime, duration, isDual, rune?.baseUrl, rune?.runeUrl, imageUrl, size]);

    // Rune mode: fills its parent slot via CSS class.
    // Single-texture mode: explicit pixel size with inline styles.
    if (!size) {
        return <canvas ref={canvasRef} className={className ?? styles.canvas} />;
    }

    return (
        <canvas
            ref={canvasRef}
            className={className}
            style={{
                width: size,
                height: size,
                imageRendering: "pixelated",
                pointerEvents: "none",
                background: "transparent",
                ...style,
            }}
        />
    );
}
