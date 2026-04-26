import { useEffect, useRef } from "react";
import { ELEMENT_COLORS } from "./styles";
import { hexToRgbTriple } from "./utils/color";
import { BURST_FRAGMENT_SHADER, BURST_VERTEX_SHADER } from "./BurstShader.frag";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BurstCanvasProps {
    /** Element name — used to look up the burst tint + shockwave color. */
    element: string;
    /** Image URL to burst (the pack art). */
    imageUrl: string;
    /** performance.now() timestamp when the burst started. */
    startTime: number;
    /** Total burst duration in milliseconds. */
    duration: number;
    /** Square buffer size in CSS pixels. */
    size: number;
    /** Optional CSS class — for layout / position styling. */
    className?: string;
    /** Optional inline style. Position/transform live here. */
    style?: React.CSSProperties;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders the pack art with the "burst" fragment shader (radial shatter
 * + bright flash + element-tinted shockwave ring). Replaces DissolveCanvas
 * for pack purchases — packs read as a sealed object that "explodes open"
 * rather than tearing apart pixel-by-pixel.
 *
 * Self-contained: each instance owns its own short-lived WebGL context
 * (one context per pack purchase). The context is disposed via
 * WEBGL_lose_context on unmount so it doesn't count against the
 * concurrent-context budget once the animation finishes.
 */
export default function BurstCanvas({ element, imageUrl, startTime, duration, size, className, style }: BurstCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = size;
        canvas.height = size;

        const gl = canvas.getContext("webgl", {
            alpha: true,
            premultipliedAlpha: false,
            antialias: false,
        });
        if (!gl) {
            console.warn("BurstCanvas: WebGL unavailable — pack burst will be invisible.");
            return;
        }

        // Compile shaders inline — no shared registry since burst fires
        // one at a time per shop visit and the context is short-lived.
        const vs = gl.createShader(gl.VERTEX_SHADER);
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        const program = gl.createProgram();
        if (!vs || !fs || !program) return;

        gl.shaderSource(vs, BURST_VERTEX_SHADER);
        gl.compileShader(vs);
        gl.shaderSource(fs, BURST_FRAGMENT_SHADER);
        gl.compileShader(fs);
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.warn("BurstCanvas: program link failed:", gl.getProgramInfoLog(program));
            return;
        }
        gl.useProgram(program);

        // Fullscreen quad — interleaved (aPosition.xy, aUv.xy).
        const quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1, 0, 1,
             1, -1, 1, 1,
            -1,  1, 0, 0,
             1,  1, 1, 0,
        ]), gl.STATIC_DRAW);

        const aPos = gl.getAttribLocation(program, "aPosition");
        const aUv = gl.getAttribLocation(program, "aUv");
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(aUv);
        gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);

        // Texture — async load; render loop gates on `loaded`.
        const tex = gl.createTexture();
        const img = new Image();
        let loaded = false;
        img.onload = () => {
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            loaded = true;
        };
        img.src = imageUrl;

        const uTimeLoc = gl.getUniformLocation(program, "uTime");
        const uTintLoc = gl.getUniformLocation(program, "uTint");
        const uTexLoc = gl.getUniformLocation(program, "uTex");
        const tint = hexToRgbTriple(ELEMENT_COLORS[element] ?? "#ffffff");

        gl.viewport(0, 0, size, size);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        let raf = 0;
        let stopped = false;
        const frame = () => {
            if (stopped) return;
            const elapsed = performance.now() - startTime;
            const t = Math.min(1, Math.max(0, elapsed / duration));

            if (loaded) {
                gl.clear(gl.COLOR_BUFFER_BIT);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.uniform1i(uTexLoc, 0);
                gl.uniform1f(uTimeLoc, t);
                gl.uniform3f(uTintLoc, tint[0], tint[1], tint[2]);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }

            if (elapsed >= duration) {
                // Hide on completion — same end-state as DissolveCanvas's
                // forward dissolve so the parent can rely on the slot
                // disappearing rather than coordinating an unmount.
                canvas.style.visibility = "hidden";
                return;
            }

            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);

        return () => {
            stopped = true;
            cancelAnimationFrame(raf);
            img.onload = null;
            img.src = "";
            gl.deleteProgram(program);
            gl.deleteShader(vs);
            gl.deleteShader(fs);
            gl.deleteBuffer(quad);
            if (tex) gl.deleteTexture(tex);
            // Free the context immediately so the WebGL context budget
            // (BackgroundShader + sharedItemRenderer + sharedDissolveRenderer)
            // doesn't grow with each pack purchase.
            const loseExt = gl.getExtension("WEBGL_lose_context");
            if (loseExt) loseExt.loseContext();
        };
    }, [element, imageUrl, startTime, duration, size]);

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
                // The internal buffer is square (size × size), but the
                // CSS width/height override (passed via `style`) reshapes
                // the display to the pack's portrait rect. `object-fit:
                // fill` overrides any inherited rule (e.g. `.flyingScroll`
                // sets `object-fit: contain`) so the square buffer
                // stretches to fill the rect rather than being letterboxed
                // into a centered square.
                objectFit: "fill",
                ...style,
            }}
        />
    );
}
