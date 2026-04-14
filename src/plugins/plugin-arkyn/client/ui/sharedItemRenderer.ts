import * as THREE from "three";

/**
 * Shared Three.js renderer for all ItemScene instances (sigils + scrolls).
 *
 * Replaces the previous per-instance `new THREE.WebGLRenderer()` pattern that
 * created one WebGL context per sigil card. With 4+ sigils equipped plus the
 * shop visible plus dissolve canvases during a cast, the per-instance
 * approach pushed the browser's WebGL context limit, evicting the background
 * shader's context (flashed white).
 *
 * This module owns a single hidden offscreen renderer. Each ItemScene
 * registers a visible display canvas; the render loop draws all items to the
 * offscreen canvas one at a time and blits each to its registered display
 * canvas via 2D `drawImage`. Visual output is pixel-identical to the old
 * per-instance approach because the shader code, material settings, camera,
 * geometry, color space, pixel ratio, and per-item tilt math are all
 * preserved verbatim.
 *
 * Context count before:  1 per ItemScene (4–8 total)
 * Context count after:   1 shared
 */

// ----- Shader sources (copied verbatim from the old ItemScene.tsx) -----

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Glossy-card shader. A soft specular highlight follows the tilt so the
// card looks like a shiny surface catching light. A subtle vignette at
// the edges adds depth. Original texture colors are preserved faithfully.
const FRAGMENT_SHADER = /* glsl */ `
precision mediump float;

uniform sampler2D uTexture;
uniform float uTime;
uniform vec2 uTilt;   // smoothed mouse offset (-1..1)

varying vec2 vUv;

void main() {
    vec4 tex = texture2D(uTexture, vUv);

    // ── Idle drift — slow circular orbit so the highlight lives even
    //    when the mouse is away. Mouse tilt adds on top. ──
    vec2 idle = vec2(
        sin(uTime * 0.6) * 0.15,
        cos(uTime * 0.45) * 0.12
    );
    vec2 offset = idle - uTilt * 0.3;

    // ── Specular highlight — follows the combined offset ──
    vec2 highlightCenter = vec2(0.5, 0.5) + offset;
    float dist = distance(vUv, highlightCenter);
    // Broad soft highlight
    float highlight = smoothstep(0.55, 0.05, dist) * 0.16;
    // Tighter bright core
    float core = smoothstep(0.25, 0.0, dist) * 0.10;

    // ── Edge vignette — subtle darkening for depth ──
    float edgeDist = distance(vUv, vec2(0.5));
    float vignette = smoothstep(0.35, 0.72, edgeDist) * 0.15;

    // ── Rounded-rect mask in UV space — corners tilt with the mesh ──
    float radius = 0.09;
    vec2 halfSize = vec2(0.5);
    vec2 q = abs(vUv - 0.5) - (halfSize - radius);
    float d = length(max(q, 0.0)) - radius;
    float mask = 1.0 - smoothstep(-0.008, 0.008, d);

    // ── Compose — additive highlight, subtractive vignette ──
    vec3 color = tex.rgb;
    color += vec3(1.0, 0.98, 0.94) * (highlight + core);
    color *= 1.0 - vignette;

    gl_FragColor = vec4(color, tex.a * mask);
}
`;

// ----- Constants (copied verbatim from ItemScene.tsx) -----

const MAX_TILT_RAD = 0.32;          // ~18 degrees max mesh rotation
const TILT_LERP_SPEED = 8;          // smoothing factor
const IDLE_TILT_AMP = 0.22;         // idle rotation amplitude (radians, ~12 deg)
const PHASE_STAGGER = 1.2;          // seconds offset per sigil index

// ----- Types -----

export interface TiltTarget {
    x: number;
    y: number;
}

export interface ItemSceneRegistration {
    /** The visible display canvas — uses a 2D context for drawImage blit. */
    canvas: HTMLCanvasElement;
    /** URL of the image texture to render. */
    imageUrl: string;
    /** Phase-stagger index — affects idle drift timing per instance. */
    index: number;
    /**
     * Mutable ref read each frame for smoothed mouse tilt. Pointer handlers
     * on the display canvas write into this; the render loop lerps the
     * per-item `tiltCurrent` toward the target each frame.
     */
    tiltTargetRef: { current: TiltTarget };
}

interface RegisteredItem {
    canvas: HTMLCanvasElement;
    ctx2d: CanvasRenderingContext2D;
    texture: THREE.Texture;
    imageUrl: string;
    index: number;
    phase: number;
    tiltTargetRef: { current: TiltTarget };
    tiltCurrent: TiltTarget;
    // Cached CSS size, updated by ResizeObserver — avoids per-frame
    // getBoundingClientRect() forced-layout reads inside the RAF loop.
    cssW: number;
    cssH: number;
    resizeObserver: ResizeObserver | null;
}

// ----- Module state (lazy-initialized) -----

let offscreenCanvas: HTMLCanvasElement | null = null;
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.OrthographicCamera | null = null;
let mesh: THREE.Mesh | null = null;
let material: THREE.ShaderMaterial | null = null;

const textureCache: Map<string, THREE.Texture> = new Map();
// Single shared loader — reused across all texture loads. Three.js's
// TextureLoader is stateless once constructed; re-instantiating per call
// is pure allocation overhead.
const sharedTextureLoader = new THREE.TextureLoader();

let nextItemId = 0;
const registered: Map<number, RegisteredItem> = new Map();

let rafId = 0;
let running = false;
let contextLost = false;
let lastFrameTime = 0;
// Track last dimensions applied to the shared renderer so we can skip
// redundant setSize() calls when every item in the frame is the same size
// (the common case — all sigil cards share a size).
let lastRendererW = 0;
let lastRendererH = 0;

// ----- Lazy initialization -----

function ensureInitialized(): boolean {
    if (renderer !== null) return true;

    offscreenCanvas = document.createElement("canvas");
    // Start at a tiny size; per-frame resize will stretch it per-item.
    offscreenCanvas.width = 1;
    offscreenCanvas.height = 1;

    try {
        renderer = new THREE.WebGLRenderer({
            canvas: offscreenCanvas,
            alpha: true,
            antialias: true,
        });
    } catch (err) {
        console.warn("sharedItemRenderer: failed to create WebGL renderer", err);
        renderer = null;
        return false;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    // Disable output sRGB encoding — the custom shader reads the texture
    // as raw pixel values and we want them displayed as-is. Without this,
    // Three.js double-applies gamma and dark blues wash out to black.
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
    camera.position.z = 2;

    material = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { value: null },
            uTime: { value: 0 },
            uTilt: { value: new THREE.Vector2(0, 0) },
        },
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthTest: false,
    });

    const geometry = new THREE.PlaneGeometry(1, 1);
    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Context loss handling — low probability of this firing now that we
    // own a single context, but cheap insurance.
    offscreenCanvas.addEventListener("webglcontextlost", (e) => {
        e.preventDefault();
        contextLost = true;
        console.warn("sharedItemRenderer: WebGL context lost, pausing render loop.");
    });
    offscreenCanvas.addEventListener("webglcontextrestored", () => {
        contextLost = false;
        // Invalidate texture cache so textures re-upload on next render.
        for (const tex of textureCache.values()) tex.dispose();
        textureCache.clear();
        for (const item of registered.values()) {
            item.texture = getOrLoadTexture(item.imageUrl);
        }
        // Renderer dimensions are owned by the browser after restore; force
        // the next frame to re-apply setSize.
        lastRendererW = 0;
        lastRendererH = 0;
        console.info("sharedItemRenderer: WebGL context restored.");
    });

    return true;
}

// ----- Texture cache -----

function getOrLoadTexture(url: string): THREE.Texture {
    const cached = textureCache.get(url);
    if (cached) return cached;
    const tex = sharedTextureLoader.load(url);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    textureCache.set(url, tex);
    return tex;
}

/**
 * Dispose every cached texture and drop the cache. Call on plugin teardown
 * or when a full session reset is appropriate. Safe to call at any time —
 * textures will simply re-upload on next render from registered items.
 */
export function disposeAllTextures(): void {
    for (const tex of textureCache.values()) tex.dispose();
    textureCache.clear();
}

// ----- Render loop -----

function startLoop(): void {
    if (running) return;
    running = true;
    lastFrameTime = performance.now();
    rafId = requestAnimationFrame(renderFrame);
}

function stopLoop(): void {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    rafId = 0;
}

function renderFrame(now: number): void {
    if (!running) return;
    rafId = requestAnimationFrame(renderFrame);

    if (contextLost || registered.size === 0 || !renderer || !material || !mesh || !scene || !camera) {
        return;
    }

    const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
    lastFrameTime = now;
    const t = now / 1000;

    const lerpFactor = 1 - Math.exp(-TILT_LERP_SPEED * dt);

    for (const item of registered.values()) {
        // Sizes come from the ResizeObserver cache — no per-frame layout
        // read. Skip items whose canvas is hidden or not yet measured.
        const cssW = item.cssW;
        const cssH = item.cssH;
        if (cssW <= 0 || cssH <= 0) continue;

        // Only apply setSize when dimensions actually change. In the common
        // case (all sigils same size) the call is skipped every frame after
        // the first. Three.js's setPixelRatio(dpr) means passing CSS size
        // here yields a `cssW*dpr × cssH*dpr` buffer.
        if (cssW !== lastRendererW || cssH !== lastRendererH) {
            renderer.setSize(cssW, cssH, false);
            lastRendererW = cssW;
            lastRendererH = cssH;
        }
        const bufW = renderer.domElement.width;
        const bufH = renderer.domElement.height;

        // Match the display canvas buffer to the offscreen buffer so the
        // blit below is pixel-perfect 1:1.
        if (item.canvas.width !== bufW || item.canvas.height !== bufH) {
            item.canvas.width = bufW;
            item.canvas.height = bufH;
        }

        // Lerp smoothed mouse tilt toward target.
        const cur = item.tiltCurrent;
        const tgt = item.tiltTargetRef.current;
        cur.x += (tgt.x - cur.x) * lerpFactor;
        cur.y += (tgt.y - cur.y) * lerpFactor;

        // Idle tilt drift — different frequencies on each axis so the
        // motion never loops exactly; looks like gentle floating.
        const phase = item.phase;
        const idleTiltX = Math.sin(t * 0.7 + phase) * IDLE_TILT_AMP
                        + Math.sin(t * 0.3 + phase * 2.1) * IDLE_TILT_AMP * 0.3;
        const idleTiltY = Math.cos(t * 0.5 + phase * 1.3) * IDLE_TILT_AMP
                        + Math.cos(t * 0.2 + phase * 0.7) * IDLE_TILT_AMP * 0.3;

        // Mouse tilt adds on top of idle drift.
        mesh.rotation.x = idleTiltX - cur.y * MAX_TILT_RAD;
        mesh.rotation.y = idleTiltY + cur.x * MAX_TILT_RAD;

        // Update uniforms for this item's draw.
        material.uniforms.uTexture.value = item.texture;
        material.uniforms.uTime.value = t;
        (material.uniforms.uTilt.value as THREE.Vector2).set(cur.x, cur.y);

        // Render to offscreen.
        renderer.render(scene, camera);

        // Blit offscreen to the item's display canvas. drawImage with
        // matching source/dest size is a 1:1 copy (pixel-perfect, same
        // result as rendering directly to the display canvas).
        item.ctx2d.clearRect(0, 0, bufW, bufH);
        item.ctx2d.drawImage(renderer.domElement, 0, 0, bufW, bufH, 0, 0, bufW, bufH);
    }
}

// ----- Public API -----

/**
 * Register a display canvas to be rendered by the shared renderer.
 * Returns an unregister function to call on unmount.
 *
 * The display canvas receives a 2D context that the render loop writes
 * into. It must not have been used for WebGL prior (getContext("webgl")
 * returns null after a 2D context is attached, and vice versa).
 */
export function registerItemScene(cfg: ItemSceneRegistration): () => void {
    if (!ensureInitialized()) {
        // Initialization failed (e.g., WebGL unavailable). Return a no-op
        // unregister so callers don't need to guard.
        return () => undefined;
    }

    const ctx2d = cfg.canvas.getContext("2d");
    if (!ctx2d) {
        console.warn("sharedItemRenderer: failed to get 2D context for display canvas");
        return () => undefined;
    }

    const id = ++nextItemId;
    const texture = getOrLoadTexture(cfg.imageUrl);
    const item: RegisteredItem = {
        canvas: cfg.canvas,
        ctx2d,
        texture,
        imageUrl: cfg.imageUrl,
        index: cfg.index,
        phase: cfg.index * PHASE_STAGGER,
        tiltTargetRef: cfg.tiltTargetRef,
        tiltCurrent: { x: 0, y: 0 },
        cssW: 0,
        cssH: 0,
        resizeObserver: null,
    };
    registered.set(id, item);

    // Seed initial size so the first frame can render before any
    // ResizeObserver callback fires.
    const initialRect = cfg.canvas.getBoundingClientRect();
    item.cssW = initialRect.width;
    item.cssH = initialRect.height;

    // Observe the display canvas for size changes. The callback just
    // writes into the item — the render loop reads on its own schedule.
    const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
            // contentRect is in CSS pixels, same as getBoundingClientRect
            // for an unstyled canvas element.
            item.cssW = entry.contentRect.width;
            item.cssH = entry.contentRect.height;
        }
    });
    observer.observe(cfg.canvas);
    item.resizeObserver = observer;

    startLoop();

    return () => {
        item.resizeObserver?.disconnect();
        item.resizeObserver = null;
        registered.delete(id);
        if (registered.size === 0) {
            stopLoop();
        }
    };
}
