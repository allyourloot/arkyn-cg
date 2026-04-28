import type { CSSProperties, ReactNode } from "react";
import styles from "./Tooltip.module.css";

type Placement = "top" | "bottom" | "left" | "right";
type Variant = "framed" | "plain";

interface TooltipProps {
    /** Placement relative to the parent element. Default: "bottom" */
    placement?: Placement;
    /** Show a CSS arrow pointing toward the parent. Default: false */
    arrow?: boolean;
    /** Visual style. "framed" uses a dark-purple rounded panel; "plain"
     *  uses a dark background with a thin border. Default: "framed" */
    variant?: Variant;
    /** Extra class name appended to the root element. */
    className?: string;
    /** Inline styles appended to the root element. */
    style?: CSSProperties;
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
    className,
    style,
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

    return (
        <div
            className={`arkyn-tooltip ${styles.tooltip} ${placementClass} ${variantClass} ${arrowClass} ${className ?? ""}`.trim()}
            style={{
                pointerEvents: "none",
                ...style,
            }}
        >
            {children}
        </div>
    );
}
