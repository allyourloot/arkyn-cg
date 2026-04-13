import { useEffect, useRef } from "react";
import { ELEMENT_COLORS } from "./styles";
import { getScrollImageUrl } from "./scrollAssets";
import { DISSOLVE_VERTEX_SHADER } from "./DissolveShader.frag";
import { createProgram } from "./utils/glProgram";

/**
 * Single-texture dissolve shader for scroll images. Uses the same noise-
 * based dissolve + glowing edge as DissolveShader.tsx but loads one scroll
 * image instead of a two-layer rune composite.
 */

// Fragment shader — same dissolve logic, single texture instead of two.
const SCROLL_DISSOLVE_FRAG = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform sampler2D uTex;
uniform float uThreshold;
uniform vec3 uEdgeColor;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
        v += a * noise(p);
        p *= 2.05;
        a *= 0.5;
    }
    return v;
}

void main() {
    vec4 col = texture2D(uTex, vUv);
    if (col.a < 0.02) discard;

    float n = fbm(vUv * 5.5) * 0.85 + 0.075;
    float th = uThreshold * 1.15;

    if (n < th) discard;

    float edgeWidth = 0.10;
    if (n < th + edgeWidth) {
        float k = 1.0 - (n - th) / edgeWidth;
        col.rgb = mix(col.rgb, uEdgeColor, k);
        col.rgb += uEdgeColor * k * 1.2;
        col.a = max(col.a, k);
    }

    gl_FragColor = col;
}
`;

interface Props {
    element: string;
    startTime: number;
    duration: number;
    /** CSS size for the canvas. */
    size: number;
    className?: string;
    style?: React.CSSProperties;
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

export default function ScrollDissolveShader({ element, startTime, duration, size, className, style }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: false });
        if (!gl) return;

        const program = createProgram(gl, DISSOLVE_VERTEX_SHADER, SCROLL_DISSOLVE_FRAG, "scrollDissolve");
        if (!program) return;
        gl.useProgram(program);

        const verts = new Float32Array([
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
        const uTex = gl.getUniformLocation(program, "uTex");
        const uEdgeColor = gl.getUniformLocation(program, "uEdgeColor");

        const [er, eg, eb] = hexToRgbTriple(ELEMENT_COLORS[element] ?? "#ffffff");
        gl.uniform3f(uEdgeColor, er, eg, eb);
        gl.uniform1i(uTex, 0);

        const tex = gl.createTexture();
        let texLoaded = false;

        const img = new Image();
        img.onload = () => {
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            texLoaded = true;
        };
        img.src = getScrollImageUrl(element);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        gl.viewport(0, 0, canvas.width, canvas.height);

        let rafId = 0;
        const render = () => {
            const elapsed = performance.now() - startTime;
            const t = Math.min(1, Math.max(0, elapsed / duration));

            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            if (texLoaded) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.uniform1f(uThreshold, t);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }

            if (t < 1) {
                rafId = requestAnimationFrame(render);
            } else {
                // Hide immediately with both properties so no stale
                // frame can flash during React unmount or GL teardown.
                canvas.style.visibility = "hidden";
                canvas.style.display = "none";
            }
        };
        rafId = requestAnimationFrame(render);

        return () => {
            cancelAnimationFrame(rafId);
            // Hide immediately so no stale frame can flash.
            canvas.style.visibility = "hidden";
            canvas.style.display = "none";
            canvas.style.opacity = "0";
            img.onload = null;
            // Defer GL teardown by two frames so the hidden canvas is
            // fully removed from the render tree before loseContext()
            // clears the buffer.
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    gl.deleteTexture(tex);
                    gl.deleteBuffer(buffer);
                    gl.deleteProgram(program);
                    const loseExt = gl.getExtension("WEBGL_lose_context");
                    if (loseExt) loseExt.loseContext();
                });
            });
        };
    }, [element, startTime, duration, size]);

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
