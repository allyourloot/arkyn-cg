import { useRef, memo, type CSSProperties, type RefObject } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
    useHand,
    useSelectedIndices,
    useLastCastRunes,
    useIsCastAnimating,
    useCastBaseCounter,
    useCastTotalDamage,
    useRoundTotalDamage,
    useSigils,
    useScrollUpgradeDisplay,
    useCastsRemaining,
    useDiscardsRemaining,
} from "../arkynStore";
import { useCastMultCounter } from "../arkynAnimations";
import { resolveSpell, getContributingRuneIndices } from "../../shared/resolveSpell";
import {
    SPELL_TIER_BASE_DAMAGE,
    SPELL_TIER_MULT,
} from "../../shared";
import { ELEMENT_COLORS, TIER_LABELS, createPanelStyleVars, INNER_FRAME_BGS } from "./styles";
import { useEnemyIsBoss } from "../arkynStore";
import RuneImage from "./RuneImage";
import BouncyText from "./BouncyText";
import RoundInfo from "./RoundInfo";
import StatBentoRow from "./StatBentoRow";
import ScrollUpgradeDisplay from "./ScrollUpgradeDisplay";
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

import bossFrameUrl from "/assets/ui/boss-frame.png?url";
import styles from "./SpellPreview.module.css";

// Standard panel chrome (frame + section + heading) plus three custom
// background variables for the damage section's Balatro-style chip row:
// blue for Base, green for Mult, red for the post-mult Total. Each chip
// reads as a distinct track at a glance.
const basePanelStyleVars = {
    ...createPanelStyleVars("blue"),
    ["--base-bg" as string]: INNER_FRAME_BGS.blue,
    ["--mult-bg" as string]: INNER_FRAME_BGS.red,
    ["--total-bg" as string]: INNER_FRAME_BGS.default,
    // Bento bottom section — mirrors ShopPanel's Bank/Casts/Discards chips.
    ["--bank-bg" as string]: INNER_FRAME_BGS.default,
    ["--hands-bg" as string]: INNER_FRAME_BGS.green,
    ["--discards-bg" as string]: INNER_FRAME_BGS.orange,
} as CSSProperties;

const bossPanelStyleVars = {
    ...basePanelStyleVars,
    "--panel-bg": `url(${bossFrameUrl})`,
} as CSSProperties;

type SpellPreviewProps = {
    ref?: React.Ref<HTMLDivElement>;
};

export default function SpellPreview({ ref }: SpellPreviewProps = {}) {
    const hand = useHand();
    const selectedIndices = useSelectedIndices();
    const lastCastRunes = useLastCastRunes();
    const isCastAnimating = useIsCastAnimating();
    const isBoss = useEnemyIsBoss();
    const panelStyleVars = isBoss ? bossPanelStyleVars : basePanelStyleVars;
    const castBaseCounter = useCastBaseCounter();
    const castTotalDamage = useCastTotalDamage();
    const roundTotalDamage = useRoundTotalDamage();
    const activeSigils = useSigils();
    const castMultCounter = useCastMultCounter();
    const castsRemaining = useCastsRemaining();
    const discardsRemaining = useDiscardsRemaining();
    // Scroll upgrade takes over the .section inner-frame while active —
    // we swap the spell-info children for the upgrade row so the two
    // don't visually overlap. Hook returns null when idle.
    const upgradeDisplay = useScrollUpgradeDisplay();

    const damageRef = useRef<HTMLSpanElement>(null);
    const totalRef = useRef<HTMLSpanElement>(null);
    const multRef = useRef<HTMLSpanElement>(null);

    // Panel state machine. The panel has three possible modes:
    //   - "preview" — player has runes selected in-hand (live spell preview)
    //   - "casting" — selection was cleared by the cast start, but we keep
    //     the spell info visible using lastCastRunes while Base/Mult tick
    //   - "empty"   — no runes to describe; shows the prompt + Total chip only
    // Computing one discriminator up top keeps the display logic + JSX
    // branches readable (no nested `previewSpell ?? castingSpell` chains).
    const selectedRunes = selectedIndices.map(i => hand[i]).filter(Boolean);
    type PanelMode =
        | { kind: "preview"; spell: NonNullable<ReturnType<typeof resolveSpell>>; sourceRunes: typeof selectedRunes }
        | { kind: "casting"; spell: NonNullable<ReturnType<typeof resolveSpell>>; sourceRunes: typeof lastCastRunes }
        | { kind: "empty" };
    const mode: PanelMode = (() => {
        if (selectedRunes.length > 0) {
            const s = resolveSpell(selectedRunes.map(r => ({ element: r.element })), activeSigils);
            if (s) return { kind: "preview", spell: s, sourceRunes: selectedRunes };
        }
        if (isCastAnimating && lastCastRunes.length > 0) {
            const s = resolveSpell(lastCastRunes.map(r => ({ element: r.element })), activeSigils);
            if (s) return { kind: "casting", spell: s, sourceRunes: lastCastRunes };
        }
        return { kind: "empty" };
    })();
    const spell = mode.kind === "empty" ? null : mode.spell;

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
    const sourceRunes = mode.kind === "empty" ? [] : mode.sourceRunes;
    const totalSourceRunes = sourceRunes.length;
    const contributingIndices = spell && totalSourceRunes > 0
        ? getContributingRuneIndices(sourceRunes.map(r => ({ element: r.element })), activeSigils)
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
    //   - Live preview: Base shows spell tier base (no per-rune yet),
    //     Total shows round accumulator (or "-" if no casts yet).
    //   - Empty (no spell): all chips show "-" except Total which shows
    //     the round accumulator if any casts have landed.
    let displayBase: number | string = "-";
    let displayMult: number | string = "-";
    let displayTotal: number | string = roundTotalDamage > 0 ? roundTotalDamage : "-";
    if (spell) {
        const baseMult = SPELL_TIER_MULT[spell.tier] ?? 0;
        const spellTierBase = SPELL_TIER_BASE_DAMAGE[spell.tier] ?? 0;

        if (mode.kind === "casting") {
            // During cast: live counters tick in real time. Each counter
            // uses `-1` as its "not yet revealed" sentinel — fall back to
            // the static preview value (or round accumulator for Total)
            // until the animation layer flips them positive.
            displayMult = castMultCounter >= 0 ? castMultCounter : baseMult;
            displayBase = castBaseCounter;
            displayTotal = castTotalDamage >= 0
                ? castTotalDamage
                : (roundTotalDamage > 0 ? roundTotalDamage : "-");
        } else {
            // Live preview shows tier mult only — hand-mult bonuses are
            // revealed during the cast animation, not before.
            displayMult = baseMult;
            displayBase = spellTierBase;
        }
    }

    // Pop the Base / Total numbers every time their live counters
    // increment during a cast. Each tick pops the chip for a Balatro-
    // style "number go up" feel.
    useCounterPop(damageRef, castBaseCounter, isCastAnimating);
    useCounterPop(multRef, castMultCounter, isCastAnimating);
    useCounterPop(totalRef, castTotalDamage, isCastAnimating);

    if (!spell) {
        return (
            <div ref={ref} className={styles.panel} style={panelStyleVars}>
                <RoundInfo />
                <div className={styles.section}>
                    {upgradeDisplay ? (
                        <ScrollUpgradeDisplay
                            element={upgradeDisplay.element}
                            oldLevel={upgradeDisplay.oldLevel}
                            newLevel={upgradeDisplay.newLevel}
                            variant="stacked"
                        />
                    ) : (
                        <BouncyText className={styles.empty}>
                            Select runes to preview spell
                        </BouncyText>
                    )}
                </div>
                <DamageChips base={displayBase} mult={displayMult} total={displayTotal} baseRef={damageRef} multRef={multRef} totalRef={totalRef} />
                <StatBentoRow castsValue={castsRemaining} discardsValue={discardsRemaining} />
            </div>
        );
    }

    const elementColor = ELEMENT_COLORS[spell.element] ?? "#aaa";

    return (
        <div ref={ref} className={styles.panel} style={panelStyleVars}>
            <RoundInfo />

            {/* Header section: rune recipe + spell name + tier + description.
                Description used to live in its own inner-frame below the
                damage counter; now it sits inside this section directly
                under the tier so the spell info reads as one unit.

                When a scroll upgrade is active, we swap the section's
                entire content for the upgrade animation — hiding spell
                info while it plays so the two layers don't visually
                fight for the same real estate. The upgrade auto-expires
                and the spell info returns. */}
            <div className={styles.section}>
                {upgradeDisplay ? (
                    <ScrollUpgradeDisplay
                        element={upgradeDisplay.element}
                        oldLevel={upgradeDisplay.oldLevel}
                        newLevel={upgradeDisplay.newLevel}
                        variant="stacked"
                    />
                ) : (
                <>
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
                       between the element colors. For 2-element combos
                       (Magma Burst, Steam Burst — two_pair / full_house /
                       duo) this reads as a smooth two-stop gradient. For
                       Haphazard's "Abomination" (up to 5 played elements),
                       the same path produces a rainbow across every played
                       element — BouncyText's piecewise interpolation makes
                       N=2..5 stops all render through one code branch. */
                    (() => {
                        const colors = spell.comboElements.map(el => ELEMENT_COLORS[el] ?? "#aaa");
                        return (
                            <BouncyText
                                className={styles.spellName}
                                colorRange={colors}
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
                            : spell.shape === "haphazard" ? " (Haphazard)"
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
                </>
                )}
            </div>

            <DamageChips base={displayBase} mult={displayMult} total={displayTotal} baseRef={damageRef} multRef={multRef} totalRef={totalRef} />

            <StatBentoRow castsValue={castsRemaining} discardsValue={discardsRemaining} />
        </div>
    );
}


type DamageChipsProps = {
    base: number | string;
    mult: number | string;
    total: number | string;
    baseRef: RefObject<HTMLSpanElement | null>;
    multRef?: RefObject<HTMLSpanElement | null>;
    totalRef: RefObject<HTMLSpanElement | null>;
};

/**
 * Round any numeric chip value so the display never shows IEEE 754 drift
 * (e.g. Executioner's 0.2x increments compound into `6.00000023841857`
 * once multiplied through Base). Strings like "-" pass through unchanged.
 */
function formatChipValue(v: number | string): number | string {
    return typeof v === "number" ? Math.round(v) : v;
}

/**
 * Damage section: a vertical stack with the Base + Mult chips on top and
 * the post-mult Total chip below. Each chip uses its own coloured 9-slice
 * frame variable (`--base-bg` blue / `--mult-bg` green / `--total-bg`
 * red) so the three tracks read as visually distinct.
 *
 * Memoized so high-frequency counter ticks that only touch one of
 * base/mult/total don't re-diff the other two chips' subtrees.
 * Ref identity is stable across renders (refs come from useRef calls
 * on the parent) so shallow memo comparison is safe.
 */
const DamageChips = memo(function DamageChips({
    base,
    mult,
    total,
    baseRef,
    multRef,
    totalRef,
}: DamageChipsProps) {
    const baseDisplay = formatChipValue(base);
    const multDisplay = formatChipValue(mult);
    const totalDisplay = formatChipValue(total);
    return (
        <div className={styles.damageSection}>
            <div className={styles.damageChipColumn}>
                <span className={styles.damageChipLabel}>Total</span>
                <div className={`${styles.damageChip} ${styles.damageChipTotal}`}>
                    <BouncyText ref={totalRef} className={styles.damageChipValue}>{totalDisplay}</BouncyText>
                </div>
            </div>
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
                            {baseDisplay}
                        </BouncyText>
                    </div>
                </div>
                <span className={styles.damageMultSymbol}>×</span>
                <div className={styles.damageChipColumn}>
                    <span className={styles.damageChipLabel}>Mult</span>
                    <div className={`${styles.damageChip} ${styles.damageChipMult}`}>
                        <BouncyText ref={multRef} className={styles.damageChipValue}>
                            {multDisplay}
                        </BouncyText>
                    </div>
                </div>
            </div>
        </div>
    );
});
