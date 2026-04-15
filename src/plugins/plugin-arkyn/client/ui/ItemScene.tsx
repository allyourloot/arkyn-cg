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
}

/**
 * Renders a glossy tilted card (sigil or scroll art) into a canvas, with
 * a tilt-reactive drop shadow behind it. All GPU work goes through the
 * shared Three.js renderer in `sharedItemRenderer.ts`; this component
 * owns the display canvas + shadow div and their pointer handlers.
 */
export default function ItemScene({ itemId, index, className, imageUrl: imageUrlProp }: ItemSceneProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const shadowRef = useRef<HTMLCanvasElement>(null);
    const tiltTargetRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const resolvedUrl = imageUrlProp || getSigilImageUrl(itemId, 128);
        const unregister = registerItemScene({
            canvas,
            shadowCanvas: shadowRef.current,
            imageUrl: resolvedUrl,
            index,
            tiltTargetRef,
        });
        return unregister;
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

    const wrapperClass = className ?? sigilBarStyles.sigilCanvas;

    return (
        <div className={wrapperClass}>
            <canvas ref={shadowRef} aria-hidden className={styles.shadow} />
            <canvas
                ref={canvasRef}
                className={styles.canvas}
                onPointerMove={HAS_HOVER ? handlePointerMove : undefined}
                onPointerLeave={HAS_HOVER ? handlePointerLeave : undefined}
            />
        </div>
    );
}
