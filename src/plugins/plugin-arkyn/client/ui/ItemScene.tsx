import { useEffect, useRef } from "react";
import { getSigilImageUrl } from "./sigilAssets";
import { registerItemScene } from "./sharedItemRenderer";
import { HAS_HOVER } from "./utils/hasHover";
import styles from "./SigilBar.module.css";

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

/**
 * Renders a glossy tilted card (sigil or scroll art) into a canvas. All
 * rendering goes through the shared Three.js renderer in
 * `sharedItemRenderer.ts` — this component is just the React shell that
 * owns the display canvas element and its pointer event handlers.
 */
export default function ItemScene({ itemId, index, className, imageUrl: imageUrlProp }: ItemSceneProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const tiltTargetRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const resolvedUrl = imageUrlProp || getSigilImageUrl(itemId, 128);
        const unregister = registerItemScene({
            canvas,
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

    return (
        <canvas
            ref={canvasRef}
            className={className ?? styles.sigilCanvas}
            onPointerMove={HAS_HOVER ? handlePointerMove : undefined}
            onPointerLeave={HAS_HOVER ? handlePointerLeave : undefined}
        />
    );
}
