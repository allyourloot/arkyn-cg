import { forwardRef, useMemo, type CSSProperties, type ReactNode } from "react";
import styles from "./BouncyText.module.css";

interface BouncyTextProps {
    children: string | number;
    /**
     * Per-character delay in seconds. Each non-space character renders
     * with `animation-delay: -(charIndex * stagger)s` so adjacent chars
     * sit at slightly different points in the bounce cycle, producing
     * a subtle wave across the text. Default: 0.06s.
     */
    stagger?: number;
    /** Class applied to the outer wrapper span (parent text styles). */
    className?: string;
    /**
     * Inline style applied to the wrapper span — useful for dynamic
     * properties like `color` that the children inherit via CSS.
     */
    style?: CSSProperties;
    /**
     * If set, each visible character's color is interpolated between
     * these two hex strings based on its position in the string. Used
     * for combo spell names so the gradient effect (e.g. green → red-
     * orange for Magma Burst) composes with the per-char bounce. The
     * `background-clip: text` trick can't be used here because nested
     * char spans break the wrapper's text-clipping mask, so we use
     * stepped per-char solid colors instead — at typical spell-name
     * sizes the steps read as a smooth gradient.
     */
    colorRange?: readonly [string, string];
}

// Parse a `#rgb` or `#rrggbb` hex string into a [r, g, b] tuple of 0-255
// integers. ELEMENT_COLORS values are all 7-char hex so this is the only
// shape we need to handle.
function parseHex(hex: string): [number, number, number] {
    const h = hex.startsWith("#") ? hex.slice(1) : hex;
    if (h.length === 3) {
        return [
            parseInt(h[0] + h[0], 16),
            parseInt(h[1] + h[1], 16),
            parseInt(h[2] + h[2], 16),
        ];
    }
    return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
    ];
}

// Linear interpolate between two hex colors at parameter `t` (0..1) and
// return a `rgb(...)` string suitable for an inline `color` value.
function lerpColor(c1: string, c2: string, t: number): string {
    const [r1, g1, b1] = parseHex(c1);
    const [r2, g2, b2] = parseHex(c2);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Renders text with each non-space character wrapped in its own
 * inline-block span so a CSS keyframe (see BouncyText.module.css)
 * can animate them independently with phase-offset delays. Spaces
 * stay as regular text nodes so word-wrapping still works on
 * multi-line bodies (e.g. spell descriptions).
 *
 * `forwardRef` exposes the wrapper span so callers can still attach
 * a ref for other GSAP work — the existing damage-pop scale tween
 * on the Base chip targets the wrapper while the per-char bob
 * runs on the inner spans, and the two transforms compose cleanly
 * because they live on different elements.
 */
const BouncyText = forwardRef<HTMLSpanElement, BouncyTextProps>(
    function BouncyText({ children, stagger = 0.06, className, style, colorRange }, ref) {
        const text = String(children);
        const items = useMemo<ReactNode[]>(() => {
            // Array.from iterates by code point so multi-codeunit chars
            // (emoji, combining marks) stay intact instead of getting
            // split mid-grapheme.
            const chars = Array.from(text);
            // Count visible (non-space) chars so the colorRange
            // interpolation distributes evenly across the actual text,
            // not across spaces. Without this, "Magma Burst" with the
            // mid-string space would land its midpoint color on the
            // space (invisible) instead of the M ↔ B boundary.
            const visibleCount = colorRange
                ? chars.reduce((acc, c) => (c === " " ? acc : acc + 1), 0)
                : 0;
            const out: ReactNode[] = [];
            let visibleIndex = 0;
            chars.forEach((char, i) => {
                if (char === " ") {
                    // Plain space — keeps the line-break opportunity so
                    // wrapped descriptions still flow naturally.
                    out.push(" ");
                    return;
                }
                const charStyle: CSSProperties = {
                    animationDelay: `${(-(i * stagger)).toFixed(3)}s`,
                };
                if (colorRange) {
                    const t = visibleCount > 1 ? visibleIndex / (visibleCount - 1) : 0;
                    charStyle.color = lerpColor(colorRange[0], colorRange[1], t);
                }
                out.push(
                    <span
                        key={i}
                        className={styles.char}
                        style={charStyle}
                    >
                        {char}
                    </span>,
                );
                visibleIndex++;
            });
            return out;
        }, [text, stagger, colorRange]);

        return (
            <span ref={ref} className={className} style={style}>
                {items}
            </span>
        );
    },
);

export default BouncyText;
