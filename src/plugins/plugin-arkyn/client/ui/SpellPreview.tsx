import { useRef, type CSSProperties, type RefObject } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
    useHand,
    useSelectedIndices,
    useLastCastRunes,
    useIsCastAnimating,
    useCastBaseCounter,
    useCastTotalDamage,
    useLastCastBaseDamage,
    useRoundTotalDamage,
} from "../arkynStore";
import { resolveSpell, getContributingRuneIndices } from "../../shared/resolveSpell";
import { SPELL_TIER_BASE_DAMAGE, SPELL_TIER_MULT } from "../../shared";
import { ELEMENT_COLORS, TIER_LABELS, createPanelStyleVars } from "./styles";
import RuneImage from "./RuneImage";
import BouncyText from "./BouncyText";
import GoldCounter from "./GoldCounter";
import RoundInfo from "./RoundInfo";
/** Plays a scale pop (1.45 -> 1) when `value` increments during a cast. */
function useCounterPop(
    ref: RefObject<HTMLElement | null>,
    value: number,
    isCastAnimating: boolean,
) {
    useGSAP(() => {
        if (!ref.current) return;
        if (!isCastAnimating || value <= 0) return;
        gsap.fromTo(
            ref.current,
            { scale: 1.45 },
            { scale: 1, duration: 0.32, ease: "back.out(2.6)", overwrite: "auto" },
        );
    }, { dependencies: [value, isCastAnimating], scope: ref });
}

import innerFrameBlueUrl from "/assets/ui/inner-frame-blue.png?url";
import innerFrameRedUrl from "/assets/ui/inner-frame-red.png?url";
import innerFrameGreenUrl from "/assets/ui/inner-frame-green.png?url";
import styles from "./SpellPreview.module.css";

// Standard panel chrome (frame + section + heading) plus three custom
// background variables for the damage section's Balatro-style chip row:
// blue for Base, green for Mult, red for the post-mult Total. Each chip
// reads as a distinct track at a glance.
const panelStyleVars = {
    ...createPanelStyleVars(innerFrameBlueUrl),
    ["--base-bg" as string]: `url(${innerFrameBlueUrl})`,
    ["--mult-bg" as string]: `url(${innerFrameGreenUrl})`,
    ["--total-bg" as string]: `url(${innerFrameRedUrl})`,
} as CSSProperties;

type SpellPreviewProps = {
    ref?: React.Ref<HTMLDivElement>;
};

export default function SpellPreview({ ref }: SpellPreviewProps = {}) {
    const hand = useHand();
    const selectedIndices = useSelectedIndices();
    const lastCastRunes = useLastCastRunes();
    const isCastAnimating = useIsCastAnimating();
    const castBaseCounter = useCastBaseCounter();
    const castTotalDamage = useCastTotalDamage();
    const lastCastBaseDamage = useLastCastBaseDamage();
    const roundTotalDamage = useRoundTotalDamage();

    const damageRef = useRef<HTMLSpanElement>(null);
    const totalRef = useRef<HTMLSpanElement>(null);

    // Live preview from currently selected runes.
    const selectedRunes = selectedIndices.map(i => hand[i]).filter(Boolean);
    const previewSpell = selectedRunes.length > 0
        ? resolveSpell(selectedRunes.map(r => ({ element: r.element })))
        : null;

    // Fall back to the most recent cast when nothing is currently selected.
    // Re-resolve from the stored cast runes so we have element/description/combo info.
    const lastCastSpell = !previewSpell && lastCastRunes.length > 0
        ? resolveSpell(lastCastRunes.map(r => ({ element: r.element })))
        : null;

    const isLive = previewSpell !== null;
    const spell = previewSpell ?? lastCastSpell;

    // Partial-rune indicator: how many of the rune cards backing this
    // spell will actually contribute. For non-synergistic mismatches
    // (e.g. 2 Fire + 2 Water → Tier 2 Fireball using only 2 of 4
    // selected runes) this lets the player see "2/4 runes" before
    // committing, so they learn the synergy graph by feedback rather
    // than by silent rune loss.
    //
    // We also keep the actual contributing runes around so the preview
    // can render them as the spell's recipe (e.g. show 2 Ice + 1 Air
    // tiles for Hailstorm) instead of a single primary-element icon.
    const sourceRunes = isLive ? selectedRunes : lastCastRunes;
    const totalSourceRunes = sourceRunes.length;
    const contributingIndices = spell && totalSourceRunes > 0
        ? getContributingRuneIndices(sourceRunes.map(r => ({ element: r.element })))
        : [];
    const contributingCount = contributingIndices.length;
    const contributingRunes = contributingIndices.map(i => sourceRunes[i]);
    const isPartial = contributingCount > 0 && contributingCount < totalSourceRunes;

    // Base + Mult + Total display source:
    //   - Total is cumulative across the round. `castTotalDamage` already
    //     includes prior round damage (the animation layer offsets the
    //     tween), so we display it directly during a cast. When idle,
    //     `roundTotalDamage` holds the final accumulated value.
    //   - During a cast: Base ticks up per-rune, Total shows the live
    //     tween (already offset by prior round total).
    //   - Live preview: Base shows spell tier base, Total shows round
    //     accumulator (or "-" if no casts yet).
    //   - Last cast: Base from snapshot, Total shows round accumulator.
    //   - Empty (no spell): all chips "-".
    let displayBase: number | string = "-";
    let displayMult: number | string = "-";
    let displayTotal: number | string = roundTotalDamage > 0 ? roundTotalDamage : "-";
    if (spell) {
        const mult = SPELL_TIER_MULT[spell.tier] ?? 0;
        const spellTierBase = SPELL_TIER_BASE_DAMAGE[spell.tier] ?? 0;
        displayMult = mult;

        if (isCastAnimating) {
            displayBase = castBaseCounter;
            // castTotalDamage already includes prior round damage (offset
            // in the animation layer), so display it directly. Before the
            // tween starts (sentinel -1), show the standing round total.
            displayTotal = castTotalDamage >= 0
                ? castTotalDamage
                : (roundTotalDamage > 0 ? roundTotalDamage : "-");
        } else if (isLive) {
            displayBase = spellTierBase;
        } else {
            displayBase = lastCastBaseDamage;
        }
    }

    // Pop the Base / Total numbers every time their live counters
    // increment during a cast. Each tick pops the chip for a Balatro-
    // style "number go up" feel.
    useCounterPop(damageRef, castBaseCounter, isCastAnimating);
    useCounterPop(totalRef, castTotalDamage, isCastAnimating);

    if (!spell) {
        return (
            <div ref={ref} className={styles.panel} style={panelStyleVars}>
                <RoundInfo />
                <span className={styles.heading}>Spell Preview</span>
                <div className={styles.section}>
                    <BouncyText className={styles.empty}>
                        Select runes to preview spell
                    </BouncyText>
                </div>
                {/* Damage chips stay mounted in the empty state too so
                    the panel doesn't reflow when a spell first resolves —
                    both read "-" until something's selected. */}
                <DamageChips base={displayBase} mult={displayMult} total={displayTotal} baseRef={damageRef} totalRef={totalRef} />
                {/* margin-top: auto inside GoldCounter pins it to the
                    bottom of the panel's flex column. */}
                <GoldCounter />
            </div>
        );
    }

    const elementColor = ELEMENT_COLORS[spell.element] ?? "#aaa";

    const headingLabel = isCastAnimating
        ? "Casting"
        : isLive
            ? "Spell Preview"
            : "Last Cast";

    return (
        <div ref={ref} className={styles.panel} style={panelStyleVars}>
            <RoundInfo />
            <span className={styles.heading}>{headingLabel}</span>

            {/* Header section: rune recipe + spell name + tier + description.
                Description used to live in its own inner-frame below the
                damage counter; now it sits inside this section directly
                under the tier so the spell info reads as one unit. */}
            <div className={styles.section}>
                {/* Rune recipe — one tile per contributing rune so the
                    player can see the actual element mix that produced
                    this spell (e.g. Hailstorm = 2 Ice + 1 Air) instead
                    of a single primary-element badge. Uses the same
                    RuneImage (rarity base + element glyph stack) the
                    hand cards use, so a recipe rune reads as the exact
                    same artwork as the hand rune it came from. Order
                    matches the contributing-runes list returned by
                    resolveSpell, so duplicate runes from a pair / triple
                    sit next to each other. */}
                {(() => {
                    // Determine whether the recipe wraps into two rows.
                    // Poker shapes have explicit split points; single-
                    // element 4- and 5-of-a-kinds mirror them (2+2 and
                    // 3+2) so each row stays within the panel width
                    // and the layout reads as a balanced stack.
                    // Rows of 1-3 runes render as a single row using
                    // the larger rune size for visual impact.
                    const count = contributingRunes.length;
                    let splitAt = 0;
                    if (spell.shape === "full_house") splitAt = 3;
                    else if (spell.shape === "two_pair") splitAt = 2;
                    else if (count === 5) splitAt = 3;
                    else if (count === 4) splitAt = 2;

                    if (splitAt > 0) {
                        return (
                            <div className={styles.runeGrid}>
                                <div className={styles.runeRow}>
                                    {contributingRunes.slice(0, splitAt).map((rune, i) => (
                                        <div key={i} className={styles.rune}>
                                            <RuneImage
                                                rarity={rune.rarity}
                                                element={rune.element}
                                                className={styles.runeLayer}
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div className={styles.runeRow}>
                                    {contributingRunes.slice(splitAt).map((rune, i) => (
                                        <div key={i + splitAt} className={styles.rune}>
                                            <RuneImage
                                                rarity={rune.rarity}
                                                element={rune.element}
                                                className={styles.runeLayer}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    }
                    return (
                        <div className={styles.runeGrid}>
                            <div className={styles.runeRow}>
                                {contributingRunes.map((rune, i) => (
                                    <div key={i} className={`${styles.rune} ${styles.runeLarge}`}>
                                        <RuneImage
                                            rarity={rune.rarity}
                                            element={rune.element}
                                            className={styles.runeLayer}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })()}

                {spell.isCombo && spell.comboElements ? (
                    /* Combo spells: pass `colorRange` to BouncyText so each
                       visible character gets a solid color interpolated
                       between the two element colors. The "gradient" is
                       technically stepped per-glyph but at typical spell-
                       name sizes (~20-28px) and short lengths (~10 chars)
                       it reads as a smooth left-to-right gradient, with
                       the bonus that:
                         - per-char bounce still works (each char has its
                           own solid color and its own translateY)
                         - text-shadow still works (text-shadow respects
                           solid colors, unlike the background-clip: text
                           workaround which forced color: transparent)
                         - no `display: inline-block` wrapper needed, so
                           the spell name still flows inline. */
                    (() => {
                        const [el1, el2] = spell.comboElements;
                        const c1 = ELEMENT_COLORS[el1] ?? "#aaa";
                        const c2 = ELEMENT_COLORS[el2] ?? "#aaa";
                        return (
                            <BouncyText
                                className={styles.spellName}
                                colorRange={[c1, c2]}
                            >
                                {spell.spellName}
                            </BouncyText>
                        );
                    })()
                ) : (
                    <BouncyText
                        className={styles.spellName}
                        style={{ color: elementColor }}
                    >
                        {spell.spellName}
                    </BouncyText>
                )}
                {/* Tier line: bouncing main label + the static partial-rune
                    warning sibling (kept out of BouncyText so its muted-red
                    styling and contextual content are preserved). */}
                <span className={styles.tier}>
                    <BouncyText>
                        {`Tier ${TIER_LABELS[spell.tier] ?? spell.tier}${
                            spell.shape === "full_house" ? " (Full House)"
                            : spell.shape === "two_pair" ? " (Two Pair)"
                            : spell.shape === "duo" ? " (Combo)"
                            : ""
                        }`}
                    </BouncyText>
                    {isPartial && (
                        <span className={styles.partialRunes}>
                            {" · "}{contributingCount}/{totalSourceRunes} runes
                        </span>
                    )}
                </span>

                <BouncyText className={styles.description}>
                    {spell.description}
                </BouncyText>
            </div>

            {/* Base + Mult damage chips, side-by-side. The Base value is
                whatever the live cast counter / preview computation /
                last-cast snapshot resolved to (see the displayBase block
                above); Mult is the static tier-derived multiplier. */}
            <DamageChips base={displayBase} mult={displayMult} total={displayTotal} baseRef={damageRef} totalRef={totalRef} />

            {/* margin-top: auto inside GoldCounter pins it to the
                bottom of the panel's flex column, regardless of how
                many sections sit above it. */}
            <GoldCounter />
        </div>
    );
}

/**
 * Damage section: a vertical stack with the Base + Mult chips on top and
 * the post-mult Total chip below. Each chip uses its own coloured 9-slice
 * frame variable (`--base-bg` blue / `--mult-bg` green / `--total-bg`
 * red) so the three tracks read as visually distinct.
 *
 * The Base chip's value span receives the GSAP pop ref so it animates
 * on every cast tick. The Mult chip prepends a `×` glyph to numeric
 * values; the Total chip is bare (it's already a damage number).
 *
 * Any of `base` / `mult` / `total` may be a number (live / cast / last
 * cast) or `"-"` (empty state).
 */
function DamageChips({
    base,
    mult,
    total,
    baseRef,
    totalRef,
}: {
    base: number | string;
    mult: number | string;
    total: number | string;
    baseRef: RefObject<HTMLSpanElement | null>;
    totalRef: RefObject<HTMLSpanElement | null>;
}) {
    return (
        <div className={styles.damageSection}>
            <div className={styles.damageRow}>
                <div className={styles.damageChipColumn}>
                    <span className={styles.damageChipLabel}>Base</span>
                    <div className={styles.damageChip}>
                        {/* baseRef forwards to BouncyText's wrapper span so
                            the existing damage-pop scale tween still hits
                            it. The scale on the wrapper composes cleanly
                            with the per-char translateY animation on the
                            inner spans. */}
                        <BouncyText ref={baseRef} className={styles.damageChipValue}>
                            {base}
                        </BouncyText>
                    </div>
                </div>
                <span className={styles.damageMultSymbol}>×</span>
                <div className={styles.damageChipColumn}>
                    <span className={styles.damageChipLabel}>Mult</span>
                    <div className={`${styles.damageChip} ${styles.damageChipMult}`}>
                        <BouncyText className={styles.damageChipValue}>
                            {mult}
                        </BouncyText>
                    </div>
                </div>
            </div>
            <div className={styles.damageChipColumn}>
                <span className={styles.damageChipLabel}>Total</span>
                <div className={`${styles.damageChip} ${styles.damageChipTotal}`}>
                    <BouncyText ref={totalRef} className={styles.damageChipValue}>{total}</BouncyText>
                </div>
            </div>
        </div>
    );
}
