import type { ReactNode } from "react";
import type { ElementType } from "../../shared/arkynConstants";
import { getBaseRuneImageUrl, getRuneImageUrl } from "./runeAssets";
import { ARCANE_CLUSTER_COLOR, ELEMENTAL_CLUSTER_COLOR } from "./styles";

const HIGHLIGHT_COLOR = "#309f30";
// Mirrors the Executioner proc bubble's background — using it as text
// color in tooltip markers ties "the fragment" to "the bubble" visually
// without the pill chrome cluttering the description.
const RED_HIGHLIGHT_COLOR = "#9f3030";
const CLUSTER_WORD_REGEX = /\b(Elemental|Arcane)\b/g;

function applyClusterWordColors(text: string, keyPrefix: string): ReactNode[] {
    const out: ReactNode[] = [];
    let lastIdx = 0;
    let subIdx = 0;
    CLUSTER_WORD_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CLUSTER_WORD_REGEX.exec(text)) !== null) {
        if (match.index > lastIdx) {
            out.push(text.slice(lastIdx, match.index));
        }
        const word = match[1];
        const color = word === "Elemental" ? ELEMENTAL_CLUSTER_COLOR : ARCANE_CLUSTER_COLOR;
        out.push(
            <span key={`${keyPrefix}-${subIdx++}`} style={{ color }}>
                {word}
            </span>,
        );
        lastIdx = match.index + word.length;
    }
    if (lastIdx < text.length) {
        out.push(text.slice(lastIdx));
    }
    return out;
}

/**
 * Renders a sigil description with three levels of styling:
 *  - `{text}` markers become green highlight spans (author-controlled emphasis).
 *  - `[[text]]` markers become red spans — reserved for fragments that also
 *    surface as the red proc bubble (Executioner's "+0.1x Mult") so the
 *    tooltip and the in-game bubble read as the same payload.
 *  - Bare proper-noun occurrences of "Elemental" or "Arcane" (outside markers)
 *    get their cluster color automatically, so the two element groupings are
 *    visually consistent across every tooltip.
 */
export function renderDescription(desc: string): ReactNode[] {
    const parts = desc.split(/(\{[^}]+\}|\[\[[^\]]+\]\])/g);
    return parts.map((part, i) => {
        if (part.startsWith("[[") && part.endsWith("]]")) {
            return (
                <span key={i} style={{ color: RED_HIGHLIGHT_COLOR }}>
                    {part.slice(2, -2)}
                </span>
            );
        }
        if (part.startsWith("{") && part.endsWith("}")) {
            return (
                <span key={i} style={{ color: HIGHLIGHT_COLOR }}>
                    {part.slice(1, -1)}
                </span>
            );
        }
        return <span key={i}>{applyClusterWordColors(part, `p${i}`)}</span>;
    });
}

interface SigilExplainerProps {
    label?: string;
    elements: readonly ElementType[];
}

const EXPLAINER_RUNE_SIZE = 24;

const explainerRuneImgStyle = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    imageRendering: "pixelated",
} as const;

/**
 * Small element-rune strip rendered below a sigil's description in its
 * tooltip. Clarifies which runes a sigil actually applies to (e.g. Fuze
 * shows the 6 Elemental runes so players know Arcane runes won't fuse).
 *
 * Renders the stacked rune layers (rarity base + element glyph) inline
 * with absolute positioning — doesn't reuse `<RuneImage>` because that
 * component relies on the consumer's CSS module for sizing/positioning.
 */
export function SigilExplainer({ label, elements }: SigilExplainerProps) {
    const baseUrl = getBaseRuneImageUrl("common");
    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                marginTop: "6px",
                alignItems: "center",
            }}
        >
            {label && (
                <span style={{ fontSize: "11px", color: "#cbd5e1", textAlign: "center" }}>
                    {renderDescription(label)}
                </span>
            )}
            <div style={{ display: "flex", gap: "2px", flexWrap: "wrap", justifyContent: "center" }}>
                {elements.map((el) => {
                    const runeUrl = getRuneImageUrl(el);
                    return (
                        <div
                            key={el}
                            style={{
                                position: "relative",
                                width: `${EXPLAINER_RUNE_SIZE}px`,
                                height: `${EXPLAINER_RUNE_SIZE}px`,
                                flex: `0 0 ${EXPLAINER_RUNE_SIZE}px`,
                            }}
                        >
                            {baseUrl && <img src={baseUrl} alt="" style={explainerRuneImgStyle} draggable={false} />}
                            {runeUrl && <img src={runeUrl} alt={el} style={explainerRuneImgStyle} draggable={false} />}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
