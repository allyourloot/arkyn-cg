import frameUrl from "/assets/ui/frame.png?url";
import innerFrameUrl from "/assets/ui/inner-frame.png?url";
import innerFrameBlueUrl from "/assets/ui/inner-frame-blue.png?url";
import innerFrameGreenUrl from "/assets/ui/inner-frame-green.png?url";
import innerFrameRedUrl from "/assets/ui/inner-frame-red.png?url";
import innerFrameOrangeUrl from "/assets/ui/inner-frame-orange.png?url";
import innerFrameGoldUrl from "/assets/ui/inner-frame-gold.png?url";

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

// Rarity chip colors — shared by sigil tooltips and the Rune Pack picker.
// Matches the `RARITY_TYPES` union (common / uncommon / rare / legendary).
export const RARITY_COLORS: Record<string, string> = {
    common: "#b0b0b0",
    uncommon: "#4ade80",
    rare: "#f87171",
    legendary: "#fbbf24",
};

/**
 * Cluster colors — semantic shorthand for the two element groupings the
 * game surfaces in tooltips and copy. "Elemental" = fire/water/earth/air/
 * ice/lightning (the 6 COMBINABLE_ELEMENTS). "Arcane" = arcane/death/
 * psy/shadow/holy/poison/steel. Shared by the description renderer so
 * proper-noun uses of "Elemental" / "Arcane" auto-color consistently
 * across every UI.
 */
export const ELEMENTAL_CLUSTER_COLOR = "#06b6d4";
export const ARCANE_CLUSTER_COLOR = "#a855f7";

// ----- Panel chrome -----

/**
 * `url(...)`-wrapped asset references for the colored inner-frame 9-slice
 * variants. Every panel that wires `--xxx-bg` CSS vars to a colored chip
 * should pull from this map instead of importing the PNG individually,
 * so changing the art only touches one file.
 */
export const INNER_FRAME_BGS = {
    default: `url(${innerFrameUrl})`,
    blue: `url(${innerFrameBlueUrl})`,
    green: `url(${innerFrameGreenUrl})`,
    red: `url(${innerFrameRedUrl})`,
    orange: `url(${innerFrameOrangeUrl})`,
    gold: `url(${innerFrameGoldUrl})`,
} as const;

export type InnerFrameColor = keyof typeof INNER_FRAME_BGS;

/**
 * CSS variables for the standard panel chrome (frame border + sectioned
 * inner panels). All panels share the same `--panel-bg` and `--section-bg`
 * art; pass an optional heading color name (or raw URL) to set
 * `--heading-bg` for panels with a tinted title strip. Panels without
 * a heading strip can omit the argument.
 *
 * Backwards-compatible: any existing caller passing a raw `url(...)` is
 * still accepted — a URL string is detected by the leading slash / protocol.
 */
export function createPanelStyleVars(
    heading?: InnerFrameColor | string,
): React.CSSProperties {
    const vars: Record<string, string> = {
        "--panel-bg": `url(${frameUrl})`,
        "--section-bg": INNER_FRAME_BGS.default,
    };
    if (heading !== undefined) {
        vars["--heading-bg"] = heading in INNER_FRAME_BGS
            ? INNER_FRAME_BGS[heading as InnerFrameColor]
            : `url(${heading})`;
    }
    return vars as React.CSSProperties;
}
