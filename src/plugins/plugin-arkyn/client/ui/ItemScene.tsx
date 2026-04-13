import { useEffect, useRef } from "react";
import * as THREE from "three";
import { getSigilImageUrl } from "./sigilAssets";
import { HAS_HOVER } from "./utils/hasHover";
import styles from "./SigilBar.module.css";

// ----- Shader sources -----

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

// ----- Constants -----

const MAX_TILT_RAD = 0.32;          // ~18 degrees max mesh rotation
const TILT_LERP_SPEED = 8;          // smoothing factor
const IDLE_TILT_AMP = 0.22;         // idle rotation amplitude (radians, ~12 deg)
const PHASE_STAGGER = 1.2;          // seconds offset per sigil index

// ----- Component -----

interface ItemSceneProps {
    /** Item ID — used to resolve a sigil image when no imageUrl is provided. */
    itemId: string;
    /** Index — offsets the idle float phase so items bob out of sync. */
    index: number;
    /** Optional CSS class for the canvas element. Defaults to SigilBar's sigilCanvas. */
    className?: string;
    /** Optional image URL — if provided, uses this instead of getSigilImageUrl(itemId). */
    imageUrl?: string;
}

export default function ItemScene({ itemId, index, className, imageUrl: imageUrlProp }: ItemSceneProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const tiltTargetRef = useRef({ x: 0, y: 0 });
    const tiltCurrentRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // ── Renderer ──
        const renderer = new THREE.WebGLRenderer({
            canvas,
            alpha: true,
            antialias: true,
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0);
        // Disable output sRGB encoding — our custom shader reads the texture
        // as raw pixel values and we want them displayed as-is. Without this,
        // Three.js double-applies gamma and dark blues wash out to black.
        renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

        // ── Scene + Camera ──
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
        camera.position.z = 2;

        // ── Texture ──
        const imageUrl = imageUrlProp || getSigilImageUrl(itemId, 128);
        const texture = new THREE.TextureLoader().load(imageUrl, () => {
            renderer.render(scene, camera);
        });
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearFilter;

        // ── Material ──
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uTexture: { value: texture },
                uTime: { value: 0 },
                uTilt: { value: new THREE.Vector2(0, 0) },
            },
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            transparent: true,
            depthTest: false,
        });

        // ── Mesh — full 1×1 plane fills the camera view, shader handles
        //    corner rounding so it stays correct during 3D tilt ──
        const geometry = new THREE.PlaneGeometry(1, 1);
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        // ── Sizing ──
        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            const w = Math.round(rect.width);
            const h = Math.round(rect.height);
            if (w > 0 && h > 0) {
                renderer.setSize(w, h, false);
            }
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(canvas);

        // ── Animation loop ──
        let lastTime = performance.now();
        let animId = 0;
        const animate = () => {
            animId = requestAnimationFrame(animate);
            const now = performance.now();
            const dt = Math.min((now - lastTime) / 1000, 0.1);
            lastTime = now;

            const t = now / 1000;
            const phase = index * PHASE_STAGGER;

            // Lerp mouse tilt toward target for smooth perspective shift
            const cur = tiltCurrentRef.current;
            const tgt = tiltTargetRef.current;
            const lerpFactor = 1 - Math.exp(-TILT_LERP_SPEED * dt);
            cur.x += (tgt.x - cur.x) * lerpFactor;
            cur.y += (tgt.y - cur.y) * lerpFactor;

            // Idle tilt drift — slow, smooth perspective rocking.
            // Different frequencies on each axis so the motion never
            // loops exactly and feels like the card is gently floating.
            const idleTiltX = Math.sin(t * 0.7 + phase) * IDLE_TILT_AMP
                            + Math.sin(t * 0.3 + phase * 2.1) * IDLE_TILT_AMP * 0.3;
            const idleTiltY = Math.cos(t * 0.5 + phase * 1.3) * IDLE_TILT_AMP
                            + Math.cos(t * 0.2 + phase * 0.7) * IDLE_TILT_AMP * 0.3;

            // Mouse tilt adds on top of the idle drift
            mesh.rotation.x = idleTiltX - cur.y * MAX_TILT_RAD;
            mesh.rotation.y = idleTiltY + cur.x * MAX_TILT_RAD;

            material.uniforms.uTime.value = now / 1000;
            material.uniforms.uTilt.value.set(cur.x, cur.y);

            renderer.render(scene, camera);
        };
        animate();

        return () => {
            cancelAnimationFrame(animId);
            ro.disconnect();
            geometry.dispose();
            material.dispose();
            texture.dispose();
            renderer.dispose();
        };
    }, [itemId, index, imageUrlProp]);

    // ----- Pointer handlers (tilt only — hover pop is GSAP in SigilBar) -----

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
        tiltTargetRef.current = { x: nx, y: ny };
    };

    const handlePointerLeave = () => {
        tiltTargetRef.current = { x: 0, y: 0 };
    };

    return (
        <canvas
            ref={canvasRef}
            className={className ?? styles.sigilCanvas}
            onPointerMove={HAS_HOVER ? handlePointerMove : undefined}
            onPointerLeave={HAS_HOVER ? handlePointerLeave : undefined}
        />
    );
}
