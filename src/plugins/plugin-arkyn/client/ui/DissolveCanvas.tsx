import { useEffect, useRef } from "react";
import { registerDissolve } from "./sharedDissolveRenderer";
import styles from "./DissolveShader.module.css";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DissolveCanvasProps {
    /** Element name — used to look up the edge-glow color. */
    element: string;
    /** performance.now() timestamp when the dissolve started. */
    startTime: number;
    /** Total dissolve duration in milliseconds. */
    duration: number;
    /**
     * When true, runs the dissolve in reverse — the rune starts fully
     * dissolved and coalesces into place over `duration` ms. Used by
     * Magic Mirror's proc to "materialize" the duplicate rune instead
     * of popping it in. Default: false (normal tear-apart dissolve).
     */
    reverse?: boolean;

    // --- Dual-texture mode (runes) ---
    /** Image URLs for the two-layer rune composite. */
    rune?: { baseUrl: string; runeUrl: string };

    // --- Single-texture mode (scrolls / items) ---
    /** Image URL for single-texture dissolves. */
    imageUrl?: string;

    /** Explicit CSS pixel size. Omit for 100% fill (rune slot mode). */
    size?: number;

    className?: string;
    style?: React.CSSProperties;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Thin wrapper around the shared dissolve renderer. Owns the visible 2D
 * display canvas; the actual WebGL rendering happens in a single
 * module-scoped offscreen context that serves every concurrent dissolve.
 * Visuals are pixel-identical to the previous per-instance WebGL version.
 */
export default function DissolveCanvas({
    element,
    startTime,
    duration,
    reverse,
    rune,
    imageUrl,
    size,
    className,
    style,
}: DissolveCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // Dependency-safe snapshots of the URLs — reading rune?.baseUrl in the
    // dep array would change identity on every render if the parent builds
    // a fresh object each render.
    const baseUrl = rune?.baseUrl;
    const runeUrl = rune?.runeUrl;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        return registerDissolve({
            canvas,
            element,
            startTime,
            duration,
            reverse,
            size,
            rune: baseUrl && runeUrl ? { baseUrl, runeUrl } : undefined,
            imageUrl,
        });
    }, [element, startTime, duration, reverse, size, baseUrl, runeUrl, imageUrl]);

    // Rune mode: fills its parent slot via CSS class.
    // Single-texture mode: explicit pixel size with inline styles.
    if (!size) {
        return <canvas ref={canvasRef} className={className ?? styles.canvas} />;
    }

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
