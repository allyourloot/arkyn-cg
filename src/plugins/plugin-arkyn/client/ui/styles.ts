import frameUrl from "/assets/ui/frame.png?url";
import innerFrameUrl from "/assets/ui/inner-frame.png?url";

export const ELEMENT_COLORS: Record<string, string> = {
    fire: "#ff5722",
    water: "#3b82f6",
    earth: "#6b8e23",
    air: "#87ceeb",
    ice: "#00d4ff",
    lightning: "#fbbf24",
    arcane: "#a855f7",
    death: "#dc143c",
    holy: "#fef08a",
    poison: "#22c55e",
    psy: "#ec4899",
    shadow: "#7c3aed",
    steel: "#9ca3af",
};

export const ELEMENT_BG_COLORS: Record<string, string> = {
    fire: "rgba(255, 87, 34, 0.3)",
    water: "rgba(59, 130, 246, 0.3)",
    earth: "rgba(107, 142, 35, 0.3)",
    air: "rgba(135, 206, 235, 0.3)",
    ice: "rgba(0, 212, 255, 0.3)",
    lightning: "rgba(251, 191, 36, 0.3)",
    arcane: "rgba(168, 85, 247, 0.3)",
    death: "rgba(220, 20, 60, 0.3)",
    holy: "rgba(254, 240, 138, 0.3)",
    poison: "rgba(34, 197, 94, 0.3)",
    psy: "rgba(236, 72, 153, 0.3)",
    shadow: "rgba(124, 58, 237, 0.3)",
    steel: "rgba(156, 163, 175, 0.3)",
};

export const TIER_LABELS = ["", "I", "II", "III", "IV", "V"];

export const FONT_STACK = "'Sburbits', system-ui, monospace";

// ----- Panel chrome -----

/**
 * CSS variables for the standard panel chrome (frame border + sectioned
 * inner panels). All panels share the same `--panel-bg` and `--section-bg`
 * art; pass an optional `headingUrl` to set `--heading-bg` for panels that
 * have a tinted title strip (e.g. gold for the enemy panel, blue for the
 * spell preview). Panels without a heading strip can omit the argument.
 *
 * Centralizes the URL imports so anyone changing the panel art only has
 * to update this file.
 */
export function createPanelStyleVars(headingUrl?: string): React.CSSProperties {
    const vars: Record<string, string> = {
        "--panel-bg": `url(${frameUrl})`,
        "--section-bg": `url(${innerFrameUrl})`,
    };
    if (headingUrl !== undefined) {
        vars["--heading-bg"] = `url(${headingUrl})`;
    }
    return vars as React.CSSProperties;
}
