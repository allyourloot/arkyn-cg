import { useRef, type CSSProperties } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
    useHand,
    useSelectedIndices,
    useLastCastRunes,
    useLastDamage,
    useIsCastAnimating,
    useCastDamageCounter,
} from "../arkynStore";
import { resolveSpell, getContributingRuneIndices } from "../../shared/resolveSpell";
import { ELEMENT_COLORS, TIER_LABELS, createPanelStyleVars } from "./styles";
import RuneImage from "./RuneImage";
import GoldCounter from "./GoldCounter";
import RoundInfo from "./RoundInfo";
import innerFrameBlueUrl from "/assets/ui/inner-frame-blue.png?url";
import innerFrameRedUrl from "/assets/ui/inner-frame-red.png?url";
import styles from "./SpellPreview.module.css";

// Standard panel chrome (frame + section + heading) plus a custom red
// `--damage-bg` for the dedicated damage counter section.
const panelStyleVars = {
    ...createPanelStyleVars(innerFrameBlueUrl),
    ["--damage-bg" as string]: `url(${innerFrameRedUrl})`,
} as CSSProperties;

export default function SpellPreview() {
    const hand = useHand();
    const selectedIndices = useSelectedIndices();
    const lastCastRunes = useLastCastRunes();
    const lastDamage = useLastDamage();
    const isCastAnimating = useIsCastAnimating();
    const castDamageCounter = useCastDamageCounter();

    const damageRef = useRef<HTMLSpanElement>(null);

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

    // Damage display source:
    //   - During a cast: the live counter that ticks up with each bubble.
    //   - After a cast (showing the last cast): the server-reported lastDamage.
    //   - Live preview (selected runes, no cast yet): "-" — the player
    //     still has to commit to see the actual number, but the frame
    //     stays mounted so the panel layout is stable.
    const displayDamage: number | string = isCastAnimating
        ? castDamageCounter
        : isLive
            ? "-"
            : lastDamage;

    // Pop the damage number every time the live counter increments. The
    // first tick (counter goes from 0 to its first cumulative amount)
    // pops, and every subsequent rune pops again — building anticipation
    // toward the final number. Outside the cast window the dep doesn't
    // change frequently, so the hook is a no-op for normal preview state.
    useGSAP(() => {
        if (!damageRef.current) return;
        if (!isCastAnimating || castDamageCounter <= 0) return;
        gsap.fromTo(
            damageRef.current,
            { scale: 1.45 },
            {
                scale: 1,
                duration: 0.32,
                ease: "back.out(2.6)",
                overwrite: "auto",
            },
        );
    }, { dependencies: [castDamageCounter, isCastAnimating], scope: damageRef });

    if (!spell) {
        return (
            <div className={styles.panel} style={panelStyleVars}>
                <RoundInfo />
                <span className={styles.heading}>Spell Preview</span>
                <div className={styles.section}>
                    <span className={styles.empty}>
                        Select runes to preview spell
                    </span>
                </div>
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
        <div className={styles.panel} style={panelStyleVars}>
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
                <div className={styles.runeRow}>
                    {contributingRunes.map((rune, i) => (
                        <div key={i} className={styles.rune}>
                            <RuneImage
                                rarity={rune.rarity}
                                element={rune.element}
                                className={styles.runeLayer}
                            />
                        </div>
                    ))}
                </div>

                <span className={styles.spellName} style={{ color: elementColor }}>
                    {spell.spellName}
                </span>

                <span className={styles.tier}>
                    Tier {TIER_LABELS[spell.tier] ?? spell.tier}
                    {spell.shape === "full_house" && " (Full House)"}
                    {spell.shape === "two_pair" && " (Two Pair)"}
                    {spell.shape === "duo" && " (Combo)"}
                    {isPartial && (
                        <span className={styles.partialRunes}>
                            {" · "}{contributingCount}/{totalSourceRunes} runes
                        </span>
                    )}
                </span>

                <span className={styles.description}>
                    {spell.description}
                </span>
            </div>

            {/* Dedicated damage counter section. Always mounted so the
                panel layout stays stable — falls back to "-" during live
                preview (player hasn't committed to a cast yet) so the
                actual number is still gated behind the cast. */}
            <div className={styles.damageSection}>
                <span ref={damageRef} className={styles.damage}>
                    {displayDamage}
                </span>
            </div>

            {/* Combo elements section */}
            {spell.isCombo && spell.comboElements && (
                <div className={styles.section}>
                    <div className={styles.comboRow}>
                        {spell.comboElements.map(el => {
                            const color = ELEMENT_COLORS[el] ?? "#aaa";
                            return (
                                <span
                                    key={el}
                                    className={styles.comboChip}
                                    style={{ color, border: `1px solid ${color}` }}
                                >
                                    {el}
                                </span>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* margin-top: auto inside GoldCounter pins it to the
                bottom of the panel's flex column, regardless of how
                many sections sit above it. */}
            <GoldCounter />
        </div>
    );
}
