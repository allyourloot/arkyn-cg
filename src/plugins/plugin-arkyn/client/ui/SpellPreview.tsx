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
import { resolveSpell } from "../../shared/resolveSpell";
import { ELEMENT_COLORS, TIER_LABELS, createPanelStyleVars } from "./styles";
import { getRuneImageUrl } from "./runeAssets";
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

    // Damage display source:
    //   - During a cast: the live counter that ticks up with each bubble.
    //   - After a cast: the server-reported lastDamage.
    //   - Live preview (selected runes, no cast yet): NO damage shown —
    //     the dedicated damage section is hidden until a cast actually
    //     resolves, so the player has to commit to see the number.
    const showDamageSection = isCastAnimating || (!isLive && lastCastSpell !== null);
    const displayDamage = isCastAnimating ? castDamageCounter : lastDamage;

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
                <span className={styles.heading}>Preview</span>
                <div className={styles.section}>
                    <span className={styles.empty}>
                        Select runes to preview spell
                    </span>
                </div>
            </div>
        );
    }

    const elementColor = ELEMENT_COLORS[spell.element] ?? "#aaa";
    const runeUrl = getRuneImageUrl(spell.element);

    const headingLabel = isCastAnimating
        ? "Casting"
        : isLive
            ? "Preview"
            : "Last Cast";

    return (
        <div className={styles.panel} style={panelStyleVars}>
            <span className={styles.heading}>{headingLabel}</span>

            {/* Header section: icon + spell name + tier + damage */}
            <div className={styles.section}>
                <div
                    className={styles.icon}
                    style={{ borderColor: elementColor, borderWidth: 2, borderStyle: "solid" }}
                >
                    {runeUrl && (
                        <img
                            src={runeUrl}
                            alt={spell.element}
                            className={styles.iconImg}
                        />
                    )}
                </div>

                <span className={styles.spellName} style={{ color: elementColor }}>
                    {spell.spellName}
                </span>

                <span className={styles.tier}>
                    Tier {TIER_LABELS[spell.tier] ?? spell.tier}
                    {spell.isCombo && " (Combo)"}
                </span>
            </div>

            {/* Dedicated damage counter section. Only mounts when there's
                a real damage value to show (during a cast or after a cast
                has resolved) — pure live preview never displays a number,
                so the player commits to a cast to see what they'll deal. */}
            {showDamageSection && (
                <div className={styles.damageSection}>
                    <span ref={damageRef} className={styles.damage}>
                        {displayDamage} DMG
                    </span>
                </div>
            )}

            {/* Description section */}
            <div className={styles.section}>
                <span className={styles.description}>
                    {spell.description}
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
        </div>
    );
}
