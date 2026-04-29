import {
    DISSOLVE_FRAGMENT_SHADER,
    DISSOLVE_FRAGMENT_SHADER_SINGLE,
    DISSOLVE_VERTEX_SHADER,
} from "./DissolveShader.frag";
import {
    createContextLossHandler,
    createProgram,
    createQuadBuffer,
    bindQuadAttributes,
    configureTexture,
} from "./utils/glProgram";
import { hexToRgbTriple } from "./utils/color";
import { HAS_HOVER } from "./utils/hasHover";
import { ELEMENT_COLORS } from "./styles";

/**
 * Shared raw-WebGL renderer for all DissolveCanvas instances (runes + scrolls).
 *
 * Replaces the previous per-instance `canvas.getContext("webgl")` pattern that
 * created one WebGL context per dissolving rune. Up to 5 runes dissolve per
 * cast + 1 scroll dissolve can be active during a shop purchase, and with
 * the runes now pre-mounted at cast start (to avoid a flicker on the fly →
 * dissolve handoff) those contexts exist for the entire cast window — not
 * just the dissolve phase. That pushed the context budget to ~8 peak and
 * regularly caused background-shader context eviction on lower-end GPUs.
 *
 * This module owns one hidden offscreen canvas + WebGL context and two
 * compiled programs (dual-texture for runes, single-texture for scrolls).
 * Each DissolveCanvas component registers its display canvas (which uses a
 * 2D context for `drawImage` blit) with the per-slot state the shader
 * needs. Visual output is pixel-identical to the old per-instance approach
 * because the shaders, uniforms, texture filter settings, blend mode, and
 * viewport math are preserved verbatim.
 *
 * Context count before:  1 per DissolveCanvas (up to 6 concurrent)
 * Context count after:   1 shared
 */

// ----- Types -----

export interface DissolveRegistration {
    /** The visible display canvas — uses a 2D context for drawImage blit. */
    canvas: HTMLCanvasElement;
    /** Element name — used to look up the edge-glow color. */
    element: string;
    /** performance.now() timestamp when the dissolve should start. */
    startTime: number;
    /** Total dissolve duration in milliseconds. */
    duration: number;
    /** Explicit CSS pixel size. Defaults to 96 (rune slot size). */
    size?: number;
    /**
     * When true, inverts the dissolve direction — threshold goes 1 → 0
     * instead of 0 → 1, producing a "materialize" effect: the rune
     * starts fully torn apart and coalesces into its intact form over
     * the duration. Used by Magic Mirror's duplicate-rune proc so the
     * new rune visibly "appears" instead of just popping in. Also
     * skips the auto-hide on completion (reverse ends at threshold=0,
     * fully visible — the parent unmounts this canvas when done).
     */
    reverse?: boolean;
    // --- Dual-texture mode (runes) ---
    /** Image URLs for the two-layer rune composite. */
    rune?: { baseUrl: string; runeUrl: string };
    // --- Single-texture mode (scrolls / items) ---
    /** Image URL for single-texture dissolves. */
    imageUrl?: string;
}

interface CachedTex {
    tex: WebGLTexture | null;
    loaded: boolean;
    /** The Image used to upload the texture. Kept alive so the cache entry
     *  can re-upload on context restoration without re-fetching. */
    img: HTMLImageElement | null;
}

interface RegisteredDissolve {
    canvas: HTMLCanvasElement;
    ctx2d: CanvasRenderingContext2D;
    element: string;
    edgeColor: [number, number, number];
    startTime: number;
    duration: number;
    reverse: boolean;
    isDual: boolean;
    /** Buffer dimensions (pxSize * dpr) — both width and height are square. */
    bufSize: number;
    tex1Url: string;           // dual: baseUrl; single: imageUrl
    tex2Url: string | null;    // dual: runeUrl; single: null
    completed: boolean;
}

// ----- Module state (lazy-initialized) -----

let offscreenCanvas: HTMLCanvasElement | null = null;
let gl: WebGLRenderingContext | null = null;
let dualProgram: WebGLProgram | null = null;
let singleProgram: WebGLProgram | null = null;
let quadBuffer: WebGLBuffer | null = null;

// Uniform location caches — one entry per program. Looked up lazily.
let dualUniforms: {
    threshold: WebGLUniformLocation | null;
    edgeColor: WebGLUniformLocation | null;
    baseTex: WebGLUniformLocation | null;
    runeTex: WebGLUniformLocation | null;
} | null = null;
let singleUniforms: {
    threshold: WebGLUniformLocation | null;
    edgeColor: WebGLUniformLocation | null;
    tex: WebGLUniformLocation | null;
} | null = null;

const textureCache: Map<string, CachedTex> = new Map();

let nextSlotId = 0;
const registered: Map<number, RegisteredDissolve> = new Map();

let rafId = 0;
let running = false;
let contextLost = false;

// Track which program is currently bound so we can skip redundant useProgram
// calls when consecutive slots use the same mode.
let lastBoundProgram: WebGLProgram | null = null;
// Track last-applied offscreen buffer size so slots sharing a size skip the
// resize/viewport cost every frame.
let lastOffscreenSize = 0;

// ----- Lazy initialization -----

function ensureInitialized(): boolean {
    if (gl !== null) return true;

    offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = 1;
    offscreenCanvas.height = 1;

    const ctx = offscreenCanvas.getContext("webgl", {
        alpha: true,
        premultipliedAlpha: false,
        antialias: false,
    });
    if (!ctx) {
        console.warn("sharedDissolveRenderer: WebGL unavailable.");
        return false;
    }
    gl = ctx;

    dualProgram = createProgram(gl, DISSOLVE_VERTEX_SHADER, DISSOLVE_FRAGMENT_SHADER, "dissolve-dual");
    singleProgram = createProgram(gl, DISSOLVE_VERTEX_SHADER, DISSOLVE_FRAGMENT_SHADER_SINGLE, "dissolve-single");
    if (!dualProgram || !singleProgram) {
        console.warn("sharedDissolveRenderer: failed to compile dissolve programs.");
        gl = null;
        return false;
    }

    quadBuffer = createQuadBuffer(gl);

    // Cache uniform locations once — they're constant per program.
    dualUniforms = {
        threshold: gl.getUniformLocation(dualProgram, "uThreshold"),
        edgeColor: gl.getUniformLocation(dualProgram, "uEdgeColor"),
        baseTex: gl.getUniformLocation(dualProgram, "uBaseTex"),
        runeTex: gl.getUniformLocation(dualProgram, "uRuneTex"),
    };
    singleUniforms = {
        threshold: gl.getUniformLocation(singleProgram, "uThreshold"),
        edgeColor: gl.getUniformLocation(singleProgram, "uEdgeColor"),
        tex: gl.getUniformLocation(singleProgram, "uTex"),
    };

    // Blend setup — identical to the per-instance DissolveCanvas.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    createContextLossHandler(offscreenCanvas, {
        onLoss: () => {
            contextLost = true;
            console.warn("sharedDissolveRenderer: WebGL context lost, pausing.");
        },
        onRestore: () => {
            if (!gl) return;
            contextLost = false;
            // Raw-WebGL programs + buffers are invalid after context loss; rebuild
            // them. (Three.js's WebGLRenderer handles this automatically — we
            // have to do it by hand here.) Uniform locations are bound to the
            // new programs, so refresh those too.
            dualProgram = createProgram(gl, DISSOLVE_VERTEX_SHADER, DISSOLVE_FRAGMENT_SHADER, "dissolve-dual");
            singleProgram = createProgram(gl, DISSOLVE_VERTEX_SHADER, DISSOLVE_FRAGMENT_SHADER_SINGLE, "dissolve-single");
            quadBuffer = createQuadBuffer(gl);
            if (dualProgram && singleProgram) {
                dualUniforms = {
                    threshold: gl.getUniformLocation(dualProgram, "uThreshold"),
                    edgeColor: gl.getUniformLocation(dualProgram, "uEdgeColor"),
                    baseTex: gl.getUniformLocation(dualProgram, "uBaseTex"),
                    runeTex: gl.getUniformLocation(dualProgram, "uRuneTex"),
                };
                singleUniforms = {
                    threshold: gl.getUniformLocation(singleProgram, "uThreshold"),
                    edgeColor: gl.getUniformLocation(singleProgram, "uEdgeColor"),
                    tex: gl.getUniformLocation(singleProgram, "uTex"),
                };
            }
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

            // Re-upload all cached textures using their retained Image refs.
            for (const entry of textureCache.values()) {
                entry.tex = null;
                entry.loaded = false;
                if (entry.img && entry.img.complete) {
                    entry.tex = gl.createTexture();
                    configureTexture(gl, entry.tex);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, entry.img);
                    entry.loaded = true;
                }
            }
            lastBoundProgram = null;
            lastOffscreenSize = 0;
            console.info("sharedDissolveRenderer: WebGL context restored.");
        },
    });

    return true;
}

// ----- Texture cache -----

function getOrLoadTexture(url: string): CachedTex {
    const cached = textureCache.get(url);
    if (cached) return cached;

    const entry: CachedTex = { tex: null, loaded: false, img: null };
    textureCache.set(url, entry);

    if (!gl) return entry;
    const tex = gl.createTexture();
    entry.tex = tex;

    const img = new Image();
    entry.img = img;
    img.onload = () => {
        if (!gl || !tex) return;
        configureTexture(gl, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        entry.loaded = true;
    };
    img.src = url;
    return entry;
}

/** Dispose every cached texture and drop the cache. */
export function disposeAllDissolveTextures(): void {
    if (!gl) {
        textureCache.clear();
        return;
    }
    for (const entry of textureCache.values()) {
        if (entry.tex) gl.deleteTexture(entry.tex);
        if (entry.img) {
            entry.img.onload = null;
            entry.img.src = "";
        }
    }
    textureCache.clear();
}

// ----- Render loop -----

function startLoop(): void {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(renderFrame);
}

function stopLoop(): void {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    rafId = 0;
}

function renderFrame(): void {
    if (!running) return;
    rafId = requestAnimationFrame(renderFrame);

    if (contextLost || !gl || !dualProgram || !singleProgram) return;
    if (registered.size === 0) return;

    const now = performance.now();

    for (const slot of registered.values()) {
        if (slot.completed) continue;

        const elapsed = now - slot.startTime;
        const t = Math.min(1, Math.max(0, elapsed / slot.duration));

        // On completion: for forward dissolves, hide the display canvas
        // exactly as the old per-instance component did (visibility +
        // display none) to preserve the "rune is gone" end-state. For
        // reverse (materialize) dissolves, the end state is "fully
        // visible" — keep the canvas painted at threshold=0 so the
        // rune stays on screen until the parent unmounts this canvas.
        if (elapsed >= slot.duration) {
            slot.completed = true;
            if (!slot.reverse) {
                slot.canvas.style.visibility = "hidden";
                slot.canvas.style.display = "none";
            }
            continue;
        }

        // Fetch cached textures — skip rendering until all are loaded
        // (same gating behavior as the old per-instance `loaded >= expectedCount`).
        const tex1 = getOrLoadTexture(slot.tex1Url);
        if (!tex1.loaded) continue;
        let tex2: CachedTex | null = null;
        if (slot.isDual) {
            tex2 = getOrLoadTexture(slot.tex2Url!);
            if (!tex2.loaded) continue;
        }

        // Resize offscreen if this slot's size differs from the last one
        // rendered. Slots with the same size (all rune slots in a cast)
        // skip this cost after the first.
        if (lastOffscreenSize !== slot.bufSize) {
            offscreenCanvas!.width = slot.bufSize;
            offscreenCanvas!.height = slot.bufSize;
            gl.viewport(0, 0, slot.bufSize, slot.bufSize);
            lastOffscreenSize = slot.bufSize;
        }

        // Match the display canvas buffer to the offscreen buffer so the
        // blit below is pixel-perfect 1:1.
        if (slot.canvas.width !== slot.bufSize || slot.canvas.height !== slot.bufSize) {
            slot.canvas.width = slot.bufSize;
            slot.canvas.height = slot.bufSize;
        }

        // Bind the right program + attributes if we're switching.
        const program = slot.isDual ? dualProgram : singleProgram;
        if (lastBoundProgram !== program) {
            gl.useProgram(program);
            gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
            bindQuadAttributes(gl, program);
            lastBoundProgram = program;
        }

        // Uniforms. Reverse mode inverts the threshold so the rune
        // materializes (starts dissolved at t=0 → fully intact at t=1)
        // instead of tearing apart.
        const u = slot.isDual ? dualUniforms! : singleUniforms!;
        const threshold = slot.reverse ? 1 - t : t;
        gl.uniform1f(u.threshold, threshold);
        gl.uniform3f(u.edgeColor, slot.edgeColor[0], slot.edgeColor[1], slot.edgeColor[2]);

        // Bind textures and sampler uniforms.
        if (slot.isDual) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, tex1.tex);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, tex2!.tex);
            gl.uniform1i(dualUniforms!.baseTex, 0);
            gl.uniform1i(dualUniforms!.runeTex, 1);
        } else {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, tex1.tex);
            gl.uniform1i(singleUniforms!.tex, 0);
        }

        // Clear + draw to offscreen.
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // Blit offscreen → display canvas 2D context. drawImage with
        // matching source/dest size is a 1:1 copy (pixel-perfect, same
        // result as rendering directly to the display canvas).
        slot.ctx2d.clearRect(0, 0, slot.bufSize, slot.bufSize);
        slot.ctx2d.drawImage(offscreenCanvas!, 0, 0, slot.bufSize, slot.bufSize, 0, 0, slot.bufSize, slot.bufSize);
    }
}

// ----- Public API -----

/**
 * Register a display canvas to be rendered by the shared dissolve renderer.
 * Returns an unregister function to call on unmount / props change.
 *
 * The display canvas must NOT have been used for WebGL prior — this
 * function calls `getContext("2d")` on it.
 */
export function registerDissolve(cfg: DissolveRegistration): () => void {
    if (!ensureInitialized()) {
        return () => undefined;
    }

    const ctx2d = cfg.canvas.getContext("2d");
    if (!ctx2d) {
        console.warn("sharedDissolveRenderer: failed to get 2D context for display canvas.");
        return () => undefined;
    }

    // If this canvas is being re-registered after a previous completion
    // (e.g., props changed and React kept the DOM node), clear the inline
    // styles the completion path set so it renders again.
    cfg.canvas.style.visibility = "";
    cfg.canvas.style.display = "";

    // Desktop renders at min(dpr, 2) for crisp dissolves; touch devices
    // use 1x. The dissolve is a ~600ms transient and the fragment shader
    // runs a 3-layer FBM noise per pixel — at 2x DPR with up to 5
    // concurrent rune dissolves that's the dominant per-frame GPU cost
    // during a cast. Dropping to 1x cuts the pixel count by 4× and is
    // visually indistinguishable on a phone screen because the rune is
    // already being torn apart by the noise. Same hover-gate pattern
    // BackgroundShader uses for its `PIXEL_SIZE` mobile downscale.
    const dpr = HAS_HOVER ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    const pxSize = cfg.size ?? 96;
    const bufSize = pxSize * dpr;

    const isDual = !!cfg.rune;
    const tex1Url = isDual ? cfg.rune!.baseUrl : (cfg.imageUrl ?? "");
    const tex2Url = isDual ? cfg.rune!.runeUrl : null;

    // Kick off the texture loads so they're in flight before the first
    // render frame.
    getOrLoadTexture(tex1Url);
    if (tex2Url) getOrLoadTexture(tex2Url);

    const edgeColor = hexToRgbTriple(ELEMENT_COLORS[cfg.element] ?? "#ffffff");

    const id = ++nextSlotId;
    const slot: RegisteredDissolve = {
        canvas: cfg.canvas,
        ctx2d,
        element: cfg.element,
        edgeColor,
        startTime: cfg.startTime,
        duration: cfg.duration,
        reverse: cfg.reverse ?? false,
        isDual,
        bufSize,
        tex1Url,
        tex2Url,
        completed: false,
    };
    registered.set(id, slot);

    startLoop();

    return () => {
        registered.delete(id);
        if (registered.size === 0) {
            stopLoop();
        }
    };
}
