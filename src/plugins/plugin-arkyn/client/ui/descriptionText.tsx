import type { ReactNode } from "react";
import type { ElementType } from "../../shared/arkynConstants";
import { getBaseRuneImageUrl, getRuneImageUrl } from "./runeAssets";
import { ARCANE_CLUSTER_COLOR, ELEMENT_COLORS, ELEMENTAL_CLUSTER_COLOR, RARITY_COLORS } from "./styles";

const HIGHLIGHT_COLOR = "#309f30";
// Mirrors the Executioner proc bubble's background — using it as text
// color in tooltip markers ties "the fragment" to "the bubble" visually
// without the pill chrome cluttering the description.
const RED_HIGHLIGHT_COLOR = "#9f3030";
// Damage-channel colors — match the Base / Mult chips in the Spell
// Preview panel (see ELEMENT_COLORS / styles.ts). When a marker's
// content reads as "+N Base" or "+N Mult", we paint the marker in the
// matching channel color so the tooltip and the in-game damage chips
// reinforce each other.
const BASE_HIGHLIGHT_COLOR = "#1f6897";
const MULT_HIGHLIGHT_COLOR = "#9f3030";  // intentionally same hex as RED_HIGHLIGHT_COLOR
// "+N Base" content (e.g. "+8 Base", "+10 Base"). Numbered only.
const BASE_CONTENT_REGEX = /^\+\d+(\.\d+)?\s+Base$/;
// "+N Mult" content with optional number, so Elixir's "{+Mult}" matches
// alongside "+5 Mult", "+10 Mult", etc. Excludes the xMult shapes
// ("x3 Mult", "x1.5 Mult") because XMULT_CONTENT_REGEX above runs first
// and routes those to the red pill instead.
const MULT_CONTENT_REGEX = /^\+(\d+(\.\d+)?\s+)?Mult$/;

// Words that get auto-colored anywhere they appear in a description.
// Three categories share this single registry:
//   - Element names render in their ELEMENT_COLORS hue ("Fire" → orange,
//     "Water" → blue, etc.) — so descriptions like "Convert up to 2 runes
//     to Air." or "Lightning runes have a {1 in 4} chance" pick up
//     coloring without the author needing to wrap each name in a marker.
//   - Cluster proper nouns ("Elemental", "Arcane") use the cluster colors.
//     Arcane shares its hex with the arcane element color so listing it
//     once is canonical.
//   - Rarity proper nouns ("Common" → light gray, "Uncommon" → green,
//     "Rare" → red, "Legendary" → gold) auto-color via RARITY_COLORS.
//     Common renders in the same hex as the Common rarity chip so the
//     tooltip and shop UI agree on the baseline rarity color.
const AUTO_COLOR_WORD_TO_COLOR: Record<string, string> = {
    Elemental: ELEMENTAL_CLUSTER_COLOR,
    Arcane: ARCANE_CLUSTER_COLOR,   // same hex as ELEMENT_COLORS.arcane
    Fire: ELEMENT_COLORS.fire,
    Water: ELEMENT_COLORS.water,
    Earth: ELEMENT_COLORS.earth,
    Air: ELEMENT_COLORS.air,
    Ice: ELEMENT_COLORS.ice,
    Lightning: ELEMENT_COLORS.lightning,
    Death: ELEMENT_COLORS.death,
    Holy: ELEMENT_COLORS.holy,
    Poison: ELEMENT_COLORS.poison,
    Psy: ELEMENT_COLORS.psy,
    Shadow: ELEMENT_COLORS.shadow,
    Steel: ELEMENT_COLORS.steel,
    Common: RARITY_COLORS.common,
    Uncommon: RARITY_COLORS.uncommon,
    Rare: RARITY_COLORS.rare,
    Legendary: RARITY_COLORS.legendary,
};
// Longer words listed first so multi-character matches win against
// shorter prefixes (regex alternation is left-to-right per position).
const AUTO_COLOR_WORD_REGEX = /\b(Elemental|Legendary|Lightning|Uncommon|Arcane|Shadow|Poison|Common|Death|Earth|Steel|Water|Holy|Rare|Fire|Ice|Air|Psy)\b/g;

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

function applyAutoColorWords(text: string, keyPrefix: string): ReactNode[] {
    const out: ReactNode[] = [];
    let lastIdx = 0;
    let subIdx = 0;
    AUTO_COLOR_WORD_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = AUTO_COLOR_WORD_REGEX.exec(text)) !== null) {
        if (match.index > lastIdx) {
            out.push(text.slice(lastIdx, match.index));
        }
        const word = match[1];
        const color = AUTO_COLOR_WORD_TO_COLOR[word];
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
 * Renders a sigil or tarot description with four levels of styling:
 *  - `{text}` markers become green highlight spans (author-controlled emphasis).
 *  - `[[text]]` markers become red-text spans — reserved for fragments that
 *    also surface as the red proc bubble (Executioner's "+0.1x Mult") so the
 *    tooltip and the in-game bubble read as the same payload.
 *  - ANY marker (either shape) whose content reads as an xMult fragment
 *    (`x<digit>` or `<digit>x` — see XMULT_CONTENT_REGEX) is upgraded to a
 *    red-background + white-text pill, overriding the color-only treatment.
 *    This ties every "xN" / "xN Mult" in a tooltip to the same visual beat
 *    as the xMult reveal bubble in the cast animation.
 *  - Element names ("Fire", "Water", …) and the cluster proper nouns
 *    ("Elemental" / "Arcane") auto-color in their respective hues. Applied
 *    both inside and outside markers — `{Fire}` renders fire-orange (the
 *    inner span overrides the outer green), and bare "Lightning" in tarot
 *    text picks up the lightning-yellow without the author wrapping it.
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
            // Damage-channel overrides — "+N Base" / "+N Mult" content
            // takes the channel color instead of the marker default. The
            // checks come AFTER the xMult pill so "x3 Mult" still pills.
            let color: string;
            if (BASE_CONTENT_REGEX.test(content)) {
                color = BASE_HIGHLIGHT_COLOR;
            } else if (MULT_CONTENT_REGEX.test(content)) {
                color = MULT_HIGHLIGHT_COLOR;
            } else {
                color = isDouble ? RED_HIGHLIGHT_COLOR : HIGHLIGHT_COLOR;
            }
            return (
                <span key={i} style={{ color }}>
                    {applyAutoColorWords(content, `m${i}`)}
                </span>
            );
        }
        return <span key={i}>{applyAutoColorWords(part, `p${i}`)}</span>;
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
