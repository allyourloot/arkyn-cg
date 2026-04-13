import type { CSSProperties, ReactNode } from "react";
import frameUrl from "/assets/ui/frame.png?url";
import styles from "./Tooltip.module.css";

type Placement = "top" | "bottom" | "left" | "right";
type Variant = "framed" | "plain";

interface TooltipProps {
    /** Placement relative to the parent element. Default: "bottom" */
    placement?: Placement;
    /** Show a CSS arrow pointing toward the parent. Default: false */
    arrow?: boolean;
    /** Visual style. "framed" uses a 9-slice border-image, "plain" uses a
     *  dark background with border. Default: "framed" */
    variant?: Variant;
    /** For "framed" variant, a custom border-image URL. Defaults to frame.png. */
    frameImageUrl?: string;
    /** Extra class name appended to the root element. */
    className?: string;
    /** Inline styles appended to the root element. */
    style?: CSSProperties;
    /** Whether this tooltip allows pointer events (e.g. for buttons inside).
     *  Default: false */
    interactive?: boolean;
    children: ReactNode;
}

/**
 * Reusable tooltip container. Renders hidden (opacity: 0) by default and
 * becomes visible when a parent element triggers the hover. Parents can
 * use the global `.arkyn-tooltip` class to drive visibility:
 *
 * ```css
 * .parentHoverTarget:hover :global(.arkyn-tooltip) { opacity: 1; }
 * ```
 */
export default function Tooltip({
    placement = "bottom",
    arrow = false,
    variant = "framed",
    frameImageUrl,
    className,
    style,
    interactive = false,
    children,
}: TooltipProps) {
    const placementClass = styles[placement];
    const variantClass = styles[variant];

    const arrowMap: Record<Placement, string> = {
        bottom: styles.arrowBottom,
        top: styles.arrowTop,
        left: styles.arrowLeft,
        right: styles.arrowRight,
    };
    const arrowClass = arrow ? arrowMap[placement] : "";

    const frameVars: CSSProperties | undefined =
        variant === "framed"
            ? { "--tooltip-frame": `url(${frameImageUrl ?? frameUrl})` } as CSSProperties
            : undefined;

    return (
        <div
            className={`arkyn-tooltip ${styles.tooltip} ${placementClass} ${variantClass} ${arrowClass} ${className ?? ""}`.trim()}
            style={{
                pointerEvents: interactive ? "auto" : "none",
                ...frameVars,
                ...style,
            }}
        >
            {children}
        </div>
    );
}
