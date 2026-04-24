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

/**
 * Matches an xMult-flavored fragment inside a `{...}` or `[[...]]` marker.
 * Hits the three shapes currently in the sigil roster:
 *   - `x1` / `x3 Mult` (Big Bang, Supercell, Eruption, Zephyr) — `x<digit>`
 *   - `+0.1x Mult` (Executioner) — `<digit>x` after an optional sign
 * Intentionally NOT anchored: a penalty like `-2 Hand Size` has no
 * `x<digit>` / `<digit>x` substring, so it never falsely matches.
 */
const XMULT_CONTENT_REGEX = /x\d|\d+x/i;

/**
 * Extracts a trailing penalty marker (e.g. `{-2 Hand Size}`) from a sigil
 * description so the tooltip can render it as a separate centered red
 * block below the body. Matches the LAST `{-<digit>…}` marker in the
 * string, optionally followed by a period and trailing whitespace.
 *
 * Recognized shape: `{-N ...}` where N starts with a digit. `+`-prefixed
 * markers (`{+1 Cast}`) are NOT treated as penalties — those are boons
 * and should stay inline in the green highlight stream.
 */
export function splitPenalty(desc: string): { main: string; penalty: string | null } {
    const match = desc.match(/^(.*?)\s*\{(-\d[^}]*)\}\.?\s*$/s);
    if (!match) return { main: desc, penalty: null };
    return { main: match[1], penalty: match[2] };
}

const XMULT_PILL_STYLE = {
    display: "inline-block",
    backgroundColor: RED_HIGHLIGHT_COLOR,
    color: "#ffffff",
    padding: "0 3px",
    borderRadius: "2px",
} as const;

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
 * Renders a sigil description with four levels of styling:
 *  - `{text}` markers become green highlight spans (author-controlled emphasis).
 *  - `[[text]]` markers become red-text spans — reserved for fragments that
 *    also surface as the red proc bubble (Executioner's "+0.1x Mult") so the
 *    tooltip and the in-game bubble read as the same payload.
 *  - ANY marker (either shape) whose content reads as an xMult fragment
 *    (`x<digit>` or `<digit>x` — see XMULT_CONTENT_REGEX) is upgraded to a
 *    red-background + white-text pill, overriding the color-only treatment.
 *    This ties every "xN" / "xN Mult" in a tooltip to the same visual beat
 *    as the xMult reveal bubble in the cast animation.
 *  - Bare proper-noun occurrences of "Elemental" or "Arcane" (outside markers)
 *    get their cluster color automatically, so the two element groupings are
 *    visually consistent across every tooltip.
 */
export function renderDescription(desc: string): ReactNode[] {
    const parts = desc.split(/(\{[^}]+\}|\[\[[^\]]+\]\])/g);
    return parts.map((part, i) => {
        const isDouble = part.startsWith("[[") && part.endsWith("]]");
        const isSingle = part.startsWith("{") && part.endsWith("}");
        if (isDouble || isSingle) {
            const content = isDouble ? part.slice(2, -2) : part.slice(1, -1);
            if (XMULT_CONTENT_REGEX.test(content)) {
                return <span key={i} style={XMULT_PILL_STYLE}>{content}</span>;
            }
            const color = isDouble ? RED_HIGHLIGHT_COLOR : HIGHLIGHT_COLOR;
            return <span key={i} style={{ color }}>{content}</span>;
        }
        return <span key={i}>{applyClusterWordColors(part, `p${i}`)}</span>;
    });
}

const PENALTY_LINE_STYLE = {
    display: "block",
    textAlign: "center",
    color: RED_HIGHLIGHT_COLOR,
    marginTop: "4px",
} as const;

interface SigilPenaltyLineProps {
    text: string;
}

/**
 * Renders a sigil's stat penalty (e.g. "-2 Hand Size") as a centered
 * red block below the description body. Extracted by `splitPenalty` so
 * the main description reads clean and the trade-off reads as a distinct
 * "cost" line. Inline-styled so the two tooltip call sites (ShopScreen,
 * SigilBar) pick it up without needing a new CSS module entry in each.
 */
export function SigilPenaltyLine({ text }: SigilPenaltyLineProps) {
    return <span style={PENALTY_LINE_STYLE}>{text}</span>;
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
