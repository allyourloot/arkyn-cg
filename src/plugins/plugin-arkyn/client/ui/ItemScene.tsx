import { useEffect, useRef } from "react";
import { getSigilImageUrl } from "./sigilAssets";
import { registerItemScene } from "./sharedItemRenderer";
import { HAS_HOVER } from "./utils/hasHover";
import sigilBarStyles from "./SigilBar.module.css";
import styles from "./ItemScene.module.css";

// ----- Component -----

interface ItemSceneProps {
    /** Item ID — used to resolve a sigil image when no imageUrl is provided. */
    itemId: string;
    /** Index — offsets the idle float phase so items bob out of sync. */
    index: number;
    /** Optional CSS class for the wrapper element — controls size & placement.
     *  Must establish a positioning context (position: relative or absolute)
     *  since the shadow + canvas children are absolutely positioned. */
    className?: string;
    /** Optional image URL — if provided, uses this instead of getSigilImageUrl(itemId). */
    imageUrl?: string;
    /** Paint the texture onto the sigil-frame backdrop. Defaults to true for
     *  sigils (no imageUrl passed) and false when an external imageUrl is
     *  supplied — scrolls and other custom art shouldn't be framed. */
    useFrame?: boolean;
    /** Image aspect ratio (width / height). Non-square art (e.g. Codex
     *  Pack 89×160 → 0.556) renders without distortion inside the square
     *  card canvas via per-item mesh scale. Defaults to 1. */
    aspectRatio?: number;
    /** Render every frame instead of throttling to 15fps when idle. Set
     *  for cards inside CSS-animated wrappers where the throttle stutters
     *  visibly against the smooth wrapper transform (e.g. picker bob). */
    smoothIdle?: boolean;
}

/**
 * Renders a glossy tilted card (sigil or scroll art) into a canvas, with
 * a tilt-reactive drop shadow behind it. All GPU work goes through the
 * shared Three.js renderer in `sharedItemRenderer.ts`; this component
 * owns the display canvas + shadow div and their pointer handlers.
 */
export default function ItemScene({ itemId, index, className, imageUrl: imageUrlProp, useFrame, aspectRatio, smoothIdle }: ItemSceneProps) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const shadowRef = useRef<HTMLCanvasElement>(null);
    const tiltTargetRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const resolvedUrl = imageUrlProp || getSigilImageUrl(itemId, 128);
        const resolvedUseFrame = useFrame ?? !imageUrlProp;
        const unregister = registerItemScene({
            canvas,
            shadowCanvas: shadowRef.current,
            imageUrl: resolvedUrl,
            index,
            tiltTargetRef,
            useFrame: resolvedUseFrame,
            aspectRatio,
            smoothIdle,
        });
        return unregister;
    }, [itemId, index, imageUrlProp, useFrame, aspectRatio, smoothIdle]);

    // Pointer handlers live on the wrapper (cell-sized) rather than the
    // canvas (which extends 15% beyond the cell for tilt headroom). That
    // way the -1..1 tilt range maps to the visible sigil bounds, not the
    // expanded render buffer.
    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (!rect) return;
        const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
        tiltTargetRef.current = { x: nx, y: ny };
    };

    const handlePointerLeave = () => {
        tiltTargetRef.current = { x: 0, y: 0 };
    };

    const wrapperClass = className ?? sigilBarStyles.sigilCanvas;

    return (
        <div
            ref={wrapperRef}
            className={wrapperClass}
            onPointerMove={HAS_HOVER ? handlePointerMove : undefined}
            onPointerLeave={HAS_HOVER ? handlePointerLeave : undefined}
        >
            <canvas ref={shadowRef} aria-hidden className={styles.shadow} />
            <canvas ref={canvasRef} className={styles.canvas} />
        </div>
    );
}
