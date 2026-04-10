import { useEffect, useRef } from "react";
import type { RuneClientData } from "../arkynStore";
import { getRuneImageUrl, getBaseRuneImageUrl } from "./runeAssets";
import { ELEMENT_COLORS } from "./styles";
import { DISSOLVE_FRAGMENT_SHADER, DISSOLVE_VERTEX_SHADER } from "./DissolveShader.frag";
import { createProgram } from "./utils/glProgram";
import styles from "./DissolveShader.module.css";

interface Props {
    rune: RuneClientData;
    /** performance.now() timestamp when the dissolve started. */
    startTime: number;
    /** Total dissolve duration in milliseconds. */
    duration: number;
}

function hexToRgbTriple(hex: string): [number, number, number] {
    const cleaned = hex.replace(/^#/, "");
    const num = parseInt(cleaned, 16);
    return [
        ((num >> 16) & 0xff) / 255,
        ((num >> 8) & 0xff) / 255,
        (num & 0xff) / 255,
    ];
}

export default function DissolveShader({ rune, startTime, duration }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: false });
        if (!gl) return;

        const program = createProgram(gl, DISSOLVE_VERTEX_SHADER, DISSOLVE_FRAGMENT_SHADER, "dissolve");
        if (!program) return;
        gl.useProgram(program);

        // Quad: position (2) + uv (2) per vertex. Triangle strip.
        // Y is flipped on the UV side because WebGL textures are bottom-up
        // by default but Image() uploads top-down.
        const verts = new Float32Array([
            // x,  y,    u, v
            -1, -1,   0, 1,
             1, -1,   1, 1,
            -1,  1,   0, 0,
             1,  1,   1, 0,
        ]);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

        const aPosition = gl.getAttribLocation(program, "aPosition");
        const aUv = gl.getAttribLocation(program, "aUv");
        gl.enableVertexAttribArray(aPosition);
        gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(aUv);
        gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);

        const uThreshold = gl.getUniformLocation(program, "uThreshold");
        const uBaseTex = gl.getUniformLocation(program, "uBaseTex");
        const uRuneTex = gl.getUniformLocation(program, "uRuneTex");
        const uEdgeColor = gl.getUniformLocation(program, "uEdgeColor");

        const [er, eg, eb] = hexToRgbTriple(ELEMENT_COLORS[rune.element] ?? "#ffffff");
        gl.uniform3f(uEdgeColor, er, eg, eb);
        gl.uniform1i(uBaseTex, 0);
        gl.uniform1i(uRuneTex, 1);

        // Texture setup helpers.
        const baseTex = gl.createTexture();
        const runeTex = gl.createTexture();
        let baseLoaded = false;
        let runeLoaded = false;

        const configureTex = (tex: WebGLTexture | null) => {
            if (!tex) return;
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        };

        const baseImg = new Image();
        baseImg.onload = () => {
            configureTex(baseTex);
            gl.bindTexture(gl.TEXTURE_2D, baseTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, baseImg);
            baseLoaded = true;
        };
        baseImg.src = getBaseRuneImageUrl(rune.rarity);

        const runeImg = new Image();
        runeImg.onload = () => {
            configureTex(runeTex);
            gl.bindTexture(gl.TEXTURE_2D, runeTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, runeImg);
            runeLoaded = true;
        };
        runeImg.src = getRuneImageUrl(rune.element);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Match the slot's CSS size at modest DPR for crisp pixels.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = 96 * dpr;
        canvas.height = 96 * dpr;
        gl.viewport(0, 0, canvas.width, canvas.height);

        let rafId = 0;
        const render = () => {
            const elapsed = performance.now() - startTime;
            const t = Math.min(1, Math.max(0, elapsed / duration));

            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            if (baseLoaded && runeLoaded) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, baseTex);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, runeTex);
                gl.uniform1f(uThreshold, t);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }

            if (t < 1) {
                rafId = requestAnimationFrame(render);
            } else {
                // Dissolve complete — hide the canvas immediately so the
                // cleared-to-white frame from an eventual loseContext()
                // (or any stale repaint) never flashes on screen.
                canvas.style.visibility = "hidden";
            }
        };
        rafId = requestAnimationFrame(render);

        return () => {
            cancelAnimationFrame(rafId);
            // Immediately hide the canvas so no stale/cleared frame can
            // paint while React removes the DOM node.
            canvas.style.display = "none";
            // Stop pending image loads from touching a torn-down context.
            baseImg.onload = null;
            runeImg.onload = null;
            // Defer GL resource cleanup to the next frame — by then React
            // has already removed the DOM node, so the cleared buffer from
            // loseContext() can never flash on screen.
            requestAnimationFrame(() => {
                gl.deleteTexture(baseTex);
                gl.deleteTexture(runeTex);
                gl.deleteBuffer(buffer);
                gl.deleteProgram(program);
                const loseExt = gl.getExtension("WEBGL_lose_context");
                if (loseExt) loseExt.loseContext();
            });
        };
    }, [rune.id, rune.element, rune.rarity, startTime, duration]);

    return <canvas ref={canvasRef} className={styles.canvas} />;
}
