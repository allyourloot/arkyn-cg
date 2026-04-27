import { forwardRef, type CSSProperties, type ReactNode } from "react";
import frameStyles from "./PanelFrame.module.css";

interface PanelFrameProps {
    children: ReactNode;
    /**
     * CSS variables for the 9-slice frame chrome — `--panel-bg` (and
     * optionally `--section-bg`, `--heading-bg`, the StatBento `--*-bg`
     * vars, etc.). Build with `createPanelStyleVars(...)` plus per-panel
     * `createStatBentoStyleVars()` / chip overrides.
     */
    styleVars: CSSProperties;
    /**
     * Per-panel layout class (width, height, padding, flex/gap, animation).
     * Composes onto the shared `.frame` chrome class — the panel only
     * needs to spell out its layout-specific rules in its own module CSS.
     */
    className?: string;
}

/**
 * Shared 9-slice frame wrapper used by every panel in the game.
 * Encapsulates the `frame.png` border-image chrome + image-rendering
 * + transparent-background setup so individual panels only own their
 * layout / sizing CSS.
 *
 * `forwardRef` exposes the wrapper div for callers that need it for
 * GSAP work or imperative measurement (ShopPanel forwards to its
 * `panelRef` for the round-info chip animation, SpellPreview passes a
 * Ref through its memoised wrapper).
 */
const PanelFrame = forwardRef<HTMLDivElement, PanelFrameProps>(
    function PanelFrame({ children, styleVars, className }, ref) {
        const composed = className
            ? `${frameStyles.frame} ${className}`
            : frameStyles.frame;
        return (
            <div ref={ref} className={composed} style={styleVars}>
                {children}
            </div>
        );
    },
);

export default PanelFrame;
