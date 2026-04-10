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
    function BouncyText({ children, stagger = 0.06, className, style }, ref) {
        const text = String(children);
        const items = useMemo<ReactNode[]>(() => {
            // Array.from iterates by code point so multi-codeunit chars
            // (emoji, combining marks) stay intact instead of getting
            // split mid-grapheme.
            const chars = Array.from(text);
            const out: ReactNode[] = [];
            chars.forEach((char, i) => {
                if (char === " ") {
                    // Plain space — keeps the line-break opportunity so
                    // wrapped descriptions still flow naturally.
                    out.push(" ");
                    return;
                }
                out.push(
                    <span
                        key={i}
                        className={styles.char}
                        style={{ animationDelay: `${(-(i * stagger)).toFixed(3)}s` }}
                    >
                        {char}
                    </span>,
                );
            });
            return out;
        }, [text, stagger]);

        return (
            <span ref={ref} className={className} style={style}>
                {items}
            </span>
        );
    },
);

export default BouncyText;
