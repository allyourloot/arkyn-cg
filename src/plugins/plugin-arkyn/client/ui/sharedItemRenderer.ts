import * as THREE from "three";
import sigilFrameUrl from "/assets/sigils/sigil-frame-128x128.png?url";

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
// the edges adds depth.
//
// When `uUseFrame == 1.0`, the sigil fills the card edge-to-edge and the
// frame's luminance is overlaid on top — the frame's cracks/highlights
// get stamped onto the sigil (engraved-on-stone look) without the frame
// itself being visible as a separate backdrop. Scrolls (parchment
// silhouettes with transparent backgrounds) pass uUseFrame == 0.0 and
// render the texture as-is.
const FRAGMENT_SHADER = /* glsl */ `
precision mediump float;

uniform sampler2D uTexture;
uniform sampler2D uFrame;
uniform float uUseFrame;  // 0.0 = raw sigil (scrolls), 1.0 = framed (sigils)
uniform float uTime;
uniform vec2 uTilt;   // smoothed mouse offset (-1..1)

varying vec2 vUv;

void main() {
    vec4 rawTex = texture2D(uTexture, vUv);

    // ── Framed path — sigil covers the full card, frame overlays on top ──
    vec4 frameTex = texture2D(uFrame, vUv);

    // Grayscale frame luminance used as the overlay source. Keeps the
    // transfer hue-neutral so the sigil's own colors stay intact; only
    // brightness is modulated.
    float frameL = dot(frameTex.rgb, vec3(0.299, 0.587, 0.114));
    vec3 blendRGB = vec3(frameL);

    // Per-channel overlay blend — dark frame areas (cracks) darken the
    // sigil, bright areas lift it, mid-gray is a no-op. Preserves sigil
    // color fidelity while stamping the carved-stone detail visibly.
    vec3 base = rawTex.rgb;
    vec3 overlay = mix(
        2.0 * base * blendRGB,
        vec3(1.0) - 2.0 * (vec3(1.0) - base) * (vec3(1.0) - blendRGB),
        step(vec3(0.5), base)
    );

    // Strength — how visible the frame's detail is on the sigil. Higher
    // → cracks/bevel read more clearly; lower → subtler stamping.
    float frameDetailStrength = 0.9;
    vec3 framedRGB = mix(base, overlay, frameDetailStrength);

    // Full coverage → alpha comes from the sigil itself.
    vec3 baseColor = mix(rawTex.rgb, framedRGB, uUseFrame);
    float baseAlpha = rawTex.a;

    // ── Idle drift — slow circular orbit so the highlight lives even
    //    when the mouse is away. Mouse tilt adds on top. ──
    vec2 idle = vec2(
        sin(uTime * 0.6) * 0.15,
        cos(uTime * 0.45) * 0.12
    );
    // Pull the highlight toward the cursor. UV x grows rightward (same
    // as mouse.x), but UV y grows upward while mouse.y grows downward —
    // so Y needs an inverted sign to end up under the cursor.
    vec2 offset = idle + vec2(uTilt.x, -uTilt.y) * 0.3;

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
    float radius = 0.035;
    vec2 halfSize = vec2(0.5);
    vec2 q = abs(vUv - 0.5) - (halfSize - radius);
    float d = length(max(q, 0.0)) - radius;
    float mask = 1.0 - smoothstep(-0.008, 0.008, d);

    // ── Compose — additive highlight, subtractive vignette ──
    vec3 color = baseColor;
    color += vec3(1.0, 0.98, 0.94) * (highlight + core);
    color *= 1.0 - vignette;

    gl_FragColor = vec4(color, baseAlpha * mask);
}
`;

// Silhouette shadow shader — emits black pixels with alpha sourced from
// the card's own texture. This matches non-rectangular sprites (scrolls
// have transparent regions around the parchment shape) as well as
// rectangular ones (sigils fill their square). The rounded-rect mask
// clips the shadow's corners the same way the card shader clips sigils,
// so sigil shadows end up as proper rounded rects rather than sharp
// squares.
const SHADOW_FRAGMENT_SHADER = /* glsl */ `
precision mediump float;

uniform sampler2D uTexture;
uniform float uShadowOpacity;

varying vec2 vUv;

void main() {
    vec4 tex = texture2D(uTexture, vUv);

    // Rounded-rect mask — must match the card shader's radius + AA band
    // so sigils cast a shadow with the same silhouette as the card front.
    float radius = 0.035;
    vec2 halfSize = vec2(0.5);
    vec2 q = abs(vUv - 0.5) - (halfSize - radius);
    float d = length(max(q, 0.0)) - radius;
    float mask = 1.0 - smoothstep(-0.008, 0.008, d);

    gl_FragColor = vec4(0.0, 0.0, 0.0, tex.a * mask * uShadowOpacity);
}
`;

// ----- Constants (copied verbatim from ItemScene.tsx) -----

const MAX_TILT_RAD = 0.18;          // ~10 degrees max mesh rotation
const TILT_LERP_SPEED = 8;          // smoothing factor
const IDLE_TILT_AMP = 0.22;         // idle rotation amplitude (radians, ~12 deg)
const PHASE_STAGGER = 1.2;          // seconds offset per sigil index

// Render-on-demand (A1) + idle throttle (A2). Cards that aren't being
// hovered and aren't due for an idle-drift tick skip the full render
// pass entirely. This caps idle shop cost at ~15fps × N cards instead
// of 60fps × N cards; hovered cards still render at full 60fps.
const IDLE_TICK_INTERVAL_MS = 67;   // ~15fps per-item idle ticks
const TILT_EPSILON = 0.001;         // tilt delta below which we call it "at rest"

// Tilt-reactive drop shadow. Shadow translate is driven off the card's
// live mesh rotation so idle drift produces micro-motion and hover tilt
// produces a clear "card lifts, shadow slides" cue. Units:
//   offset px per radian of tilt  — 15 ⇒ ~8px at max combined tilt
//   base drop  — constant downward shift so the card always appears to
//   float slightly above a surface even at neutral tilt.
//   opacity — how dark the silhouette shadow renders.
const SHADOW_OFFSET_PX_PER_RAD = 15;
const SHADOW_BASE_DROP_PX = 4;
const SHADOW_OPACITY = 0.35;

// ----- Types -----

export interface TiltTarget {
    x: number;
    y: number;
}

export interface ItemSceneRegistration {
    /** The visible display canvas — uses a 2D context for drawImage blit. */
    canvas: HTMLCanvasElement;
    /** Shadow display canvas painted behind the card. The render loop
     *  renders a black-silhouette pass sampled from the item's texture
     *  into this canvas, and writes a per-frame `transform: translate(...)`
     *  driven off the card's tilt so the shadow shifts as the card rocks.
     *  Optional — omitting it skips both passes. */
    shadowCanvas?: HTMLCanvasElement | null;
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
    /**
     * When true, the sigil-frame backdrop is composited behind the texture
     * so the card reads as an engraved plate rather than a flat sticker.
     * Scrolls (parchment silhouettes with their own transparent background)
     * should pass false. Defaults to true at the call site.
     */
    useFrame?: boolean;
}

interface RegisteredItem {
    canvas: HTMLCanvasElement;
    shadowCanvas: HTMLCanvasElement | null;
    ctx2d: CanvasRenderingContext2D;
    shadowCtx2d: CanvasRenderingContext2D | null;
    texture: THREE.Texture;
    imageUrl: string;
    useFrame: boolean;
    index: number;
    phase: number;
    tiltTargetRef: { current: TiltTarget };
    tiltCurrent: TiltTarget;
    // Cached CSS size, updated by ResizeObserver — avoids per-frame
    // getBoundingClientRect() forced-layout reads inside the RAF loop.
    cssW: number;
    cssH: number;
    resizeObserver: ResizeObserver | null;
    // ----- Render-on-demand state (A1 + A2) -----
    // Viewport visibility tracked via IntersectionObserver; off-screen
    // items skip the render path entirely.
    isVisible: boolean;
    intersectionObserver: IntersectionObserver | null;
    // Last time (ms) an idle-drift tick rendered this item. Throttled
    // to IDLE_TICK_INTERVAL_MS so ambient bob runs at ~15fps instead of
    // 60fps.
    lastIdleRenderTime: number;
    // ----- Shadow cache (A3) -----
    // Shadow pixels depend only on the texture + mesh-rotation-(0,0,0),
    // so they're identical every frame. Render once when the texture
    // is ready, cache forever. CSS transform on the shadow canvas
    // (position, not pixels) still updates per render for tilt reactivity.
    shadowRendered: boolean;
}

// ----- Module state (lazy-initialized) -----

let offscreenCanvas: HTMLCanvasElement | null = null;
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.OrthographicCamera | null = null;
let mesh: THREE.Mesh | null = null;
let material: THREE.ShaderMaterial | null = null;
let shadowMaterial: THREE.ShaderMaterial | null = null;

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

// ----- Perf instrumentation (A6) -----
// Items-rendered-per-frame counter consumed by the dev PerfHud. Updated
// inside the render loop; published after each frame completes so readers
// see a stable value between frames. Zero runtime cost when nobody reads.
let currentFrameItemsRendered = 0;
let lastFrameItemsRendered = 0;
export function getItemsRenderedLastFrame(): number {
    return lastFrameItemsRendered;
}
export function getRegisteredItemCount(): number {
    return registered.size;
}

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
    // Camera bounds wider than the 1x1 plane so that tilted corners have
    // room to extend without being clipped at the canvas edge. The plane
    // occupies the inner 1/1.3 ≈ 77% of the view, and CSS grows the
    // canvas by the same factor so the visual sigil size is preserved.
    camera = new THREE.OrthographicCamera(-0.65, 0.65, 0.65, -0.65, 0.1, 10);
    camera.position.z = 2;

    // Preload the frame texture — shared across every framed sigil.
    // Held in the module's texture cache so `disposeAllTextures()` clears
    // it alongside every other texture on teardown.
    const frameTexture = getOrLoadTexture(sigilFrameUrl);

    material = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { value: null },
            uFrame: { value: frameTexture },
            uUseFrame: { value: 1 },
            uTime: { value: 0 },
            uTilt: { value: new THREE.Vector2(0, 0) },
        },
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthTest: false,
    });

    shadowMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { value: null },
            uShadowOpacity: { value: SHADOW_OPACITY },
        },
        vertexShader: VERTEX_SHADER,
        fragmentShader: SHADOW_FRAGMENT_SHADER,
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

// Decide whether an item needs a render this frame. Returns true if:
//  - Item is visible AND
//    - its smoothed tilt isn't yet at its target (hover lerp in-flight), OR
//    - an idle-drift tick is due (15fps ambient animation)
// Static-at-rest items return false → skip everything.
function needsRender(item: RegisteredItem, now: number): boolean {
    if (!item.isVisible) return false;
    const tgt = item.tiltTargetRef.current;
    const cur = item.tiltCurrent;
    if (Math.abs(tgt.x - cur.x) > TILT_EPSILON) return true;
    if (Math.abs(tgt.y - cur.y) > TILT_EPSILON) return true;
    if (now - item.lastIdleRenderTime >= IDLE_TICK_INTERVAL_MS) return true;
    return false;
}

function renderFrame(now: number): void {
    if (!running) return;
    rafId = requestAnimationFrame(renderFrame);

    // Publish last frame's counter for the PerfHud, then reset for this
    // frame. Writers below increment per actual render.
    lastFrameItemsRendered = currentFrameItemsRendered;
    currentFrameItemsRendered = 0;

    if (contextLost || registered.size === 0 || !renderer || !material || !shadowMaterial || !mesh || !scene || !camera) {
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

        // Render-on-demand gate. Skip the entire per-item work (lerp,
        // idle-drift math, shader uniform updates, 2× render, 2× blit)
        // for items that aren't hovered, aren't in lerp transit, and
        // aren't due for an idle tick. This is the dominant cost saver
        // for full sigil bars in the shop.
        if (!needsRender(item, now)) continue;

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
        // blit below is pixel-perfect 1:1. A resize invalidates the
        // cached shadow since the pixel grid changed.
        if (item.canvas.width !== bufW || item.canvas.height !== bufH) {
            item.canvas.width = bufW;
            item.canvas.height = bufH;
        }
        if (item.shadowCanvas && (item.shadowCanvas.width !== bufW || item.shadowCanvas.height !== bufH)) {
            item.shadowCanvas.width = bufW;
            item.shadowCanvas.height = bufH;
            item.shadowRendered = false;
        }

        // Lerp smoothed mouse tilt toward target.
        const cur = item.tiltCurrent;
        const tgt = item.tiltTargetRef.current;
        cur.x += (tgt.x - cur.x) * lerpFactor;
        cur.y += (tgt.y - cur.y) * lerpFactor;

        // Idle tilt drift — different frequencies on each axis so the
        // motion never loops exactly; looks like gentle floating. Note:
        // this function is only evaluated when we render, so with A2 it
        // samples the idle curve at ~15fps instead of 60fps. Ambient bob
        // still reads as smooth — no visible stepping at this tempo.
        const phase = item.phase;
        const idleTiltX = Math.sin(t * 0.7 + phase) * IDLE_TILT_AMP
                        + Math.sin(t * 0.3 + phase * 2.1) * IDLE_TILT_AMP * 0.3;
        const idleTiltY = Math.cos(t * 0.5 + phase * 1.3) * IDLE_TILT_AMP
                        + Math.cos(t * 0.2 + phase * 0.7) * IDLE_TILT_AMP * 0.3;

        // Card tilt (mouse + idle). Shadow pass uses rotation.set(0,0,0)
        // below since a ground-plane shadow shouldn't itself tilt — only
        // the translate offset tracks the card's rotation.
        //
        // Sign mapping: the hovered corner should lean toward the camera.
        // In Three.js, +rotation.x pitches the top toward +Z (forward),
        // and +rotation.y yaws the left edge toward +Z. Mouse coords
        // have +y downward and +x rightward, so both axes need a sign
        // flip to make the corner under the cursor come forward.
        const cardRotX = idleTiltX - cur.y * MAX_TILT_RAD;
        const cardRotY = idleTiltY - cur.x * MAX_TILT_RAD;

        // ── Shadow pass (A3) — cached after first successful render.
        //    Shadow pixels depend only on texture + mesh rotation (0,0,0),
        //    so they're identical frame-to-frame. We only run the render
        //    + blit here on the first render (or after a resize, which
        //    clears shadowRendered). The tilt-reactive shadow *position*
        //    (CSS transform on the shadow canvas) still updates every
        //    render below.
        if (item.shadowCtx2d && item.shadowCanvas && !item.shadowRendered) {
            mesh.material = shadowMaterial;
            shadowMaterial.uniforms.uTexture.value = item.texture;
            mesh.rotation.set(0, 0, 0);
            renderer.render(scene, camera);
            item.shadowCtx2d.clearRect(0, 0, bufW, bufH);
            item.shadowCtx2d.drawImage(renderer.domElement, 0, 0, bufW, bufH, 0, 0, bufW, bufH);
            // Only mark cached when the texture has actually loaded — an
            // empty-texture shadow would get stamped forever otherwise.
            const img = item.texture.image as HTMLImageElement | undefined;
            if (img && img.complete && img.naturalWidth > 0) {
                item.shadowRendered = true;
            }
        }

        // ── Card pass — tilted mesh, glossy-card material.
        mesh.material = material;
        mesh.rotation.x = cardRotX;
        mesh.rotation.y = cardRotY;

        // Tilt-reactive shadow translate — written to the shadow canvas's
        // style (GPU-composited, no layout/paint). rotation.y>0 tips the
        // left edge forward, so the shadow slides right; rotation.x>0
        // tips the top back, so the shadow drops further down the screen.
        if (item.shadowCanvas) {
            const shadowX = cardRotY * SHADOW_OFFSET_PX_PER_RAD;
            const shadowY = cardRotX * SHADOW_OFFSET_PX_PER_RAD + SHADOW_BASE_DROP_PX;
            item.shadowCanvas.style.transform = `translate(${shadowX.toFixed(2)}px, ${shadowY.toFixed(2)}px)`;
        }

        // Update uniforms for this item's draw.
        material.uniforms.uTexture.value = item.texture;
        material.uniforms.uUseFrame.value = item.useFrame ? 1 : 0;
        material.uniforms.uTime.value = t;
        (material.uniforms.uTilt.value as THREE.Vector2).set(cur.x, cur.y);

        // Render to offscreen.
        renderer.render(scene, camera);

        // Blit offscreen to the item's display canvas. drawImage with
        // matching source/dest size is a 1:1 copy (pixel-perfect, same
        // result as rendering directly to the display canvas).
        item.ctx2d.clearRect(0, 0, bufW, bufH);
        item.ctx2d.drawImage(renderer.domElement, 0, 0, bufW, bufH, 0, 0, bufW, bufH);

        // Bookkeeping for the next needsRender() decision + PerfHud counter.
        item.lastIdleRenderTime = now;
        currentFrameItemsRendered++;
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

    const shadowCanvas = cfg.shadowCanvas ?? null;
    const shadowCtx2d = shadowCanvas ? shadowCanvas.getContext("2d") : null;
    if (shadowCanvas && !shadowCtx2d) {
        console.warn("sharedItemRenderer: failed to get 2D context for shadow canvas");
    }

    const id = ++nextItemId;
    const texture = getOrLoadTexture(cfg.imageUrl);
    const item: RegisteredItem = {
        canvas: cfg.canvas,
        shadowCanvas,
        ctx2d,
        shadowCtx2d,
        texture,
        imageUrl: cfg.imageUrl,
        useFrame: cfg.useFrame ?? true,
        index: cfg.index,
        phase: cfg.index * PHASE_STAGGER,
        tiltTargetRef: cfg.tiltTargetRef,
        tiltCurrent: { x: 0, y: 0 },
        cssW: 0,
        cssH: 0,
        resizeObserver: null,
        // A1: assume visible until the IntersectionObserver reports otherwise;
        // initial callback fires shortly after observe() with the real state.
        isVisible: true,
        intersectionObserver: null,
        // A2: start at 0 so the first frame definitely qualifies as
        // "idle tick due" and the card paints immediately on mount.
        lastIdleRenderTime: 0,
        // A3: shadow not yet rendered; main loop draws it once when
        // texture is ready, then caches.
        shadowRendered: false,
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

    // A1: Viewport visibility via IntersectionObserver. Covers offscreen
    // scroll, `display: none`, and `visibility: hidden`. Does NOT catch
    // opacity: 0 ancestors — that's an acceptable miss for Phase A since
    // the dominant cost is static-idle-shop, which this fully handles.
    const io = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            item.isVisible = entry.isIntersecting;
        }
    });
    io.observe(cfg.canvas);
    item.intersectionObserver = io;

    startLoop();

    return () => {
        item.resizeObserver?.disconnect();
        item.resizeObserver = null;
        item.intersectionObserver?.disconnect();
        item.intersectionObserver = null;
        registered.delete(id);
        if (registered.size === 0) {
            stopLoop();
        }
    };
}
