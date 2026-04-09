import {
    useHand,
    useSelectedIndices,
    useLastCastRunes,
    useLastDamage,
} from "../arkynStore";
import { resolveSpell } from "../../shared/resolveSpell";
import { TIER_MULTIPLIERS } from "../../shared/spellTable";
import { ELEMENT_COLORS, TIER_LABELS } from "./styles";
import { getRuneImageUrl } from "./runeAssets";
import frameUrl from "/assets/ui/frame.png?url";
import innerFrameUrl from "/assets/ui/inner-frame.png?url";
import innerFrameBlueUrl from "/assets/ui/inner-frame-blue.png?url";
import styles from "./SpellPreview.module.css";

const panelStyleVars = {
    "--panel-bg": `url(${frameUrl})`,
    "--section-bg": `url(${innerFrameUrl})`,
    "--heading-bg": `url(${innerFrameBlueUrl})`,
} as React.CSSProperties;

export default function SpellPreview() {
    const hand = useHand();
    const selectedIndices = useSelectedIndices();
    const lastCastRunes = useLastCastRunes();
    const lastDamage = useLastDamage();

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
    // Live preview shows estimated damage (no enemy resists factored in);
    // last-cast shows the server's actual damage dealt.
    const tierMult = TIER_MULTIPLIERS[spell.tier] ?? 1;
    const displayDamage = isLive
        ? Math.round(spell.baseDamage * tierMult)
        : lastDamage;
    const damagePrefix = isLive ? "~" : "";

    return (
        <div className={styles.panel} style={panelStyleVars}>
            <span className={styles.heading}>
                {isLive ? "Preview" : "Last Cast"}
            </span>

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

                <span className={styles.damage}>
                    {damagePrefix}{displayDamage} DMG
                </span>
            </div>

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
