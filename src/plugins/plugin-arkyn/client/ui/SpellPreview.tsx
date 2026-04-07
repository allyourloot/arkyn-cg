import { useHand, useSelectedIndices } from "../arkynStore";
import { resolveSpell } from "../../shared/resolveSpell";
import { TIER_MULTIPLIERS } from "../../shared/spellTable";
import { ELEMENT_COLORS, TIER_LABELS } from "./styles";
import { getRuneImageUrl } from "./runeAssets";
import styles from "./SpellPreview.module.css";

export default function SpellPreview() {
    const hand = useHand();
    const selectedIndices = useSelectedIndices();

    // Compute live spell preview from selected runes
    const selectedRunes = selectedIndices.map(i => hand[i]).filter(Boolean);
    const spell = selectedRunes.length > 0
        ? resolveSpell(selectedRunes.map(r => ({ element: r.element })))
        : null;

    const tierMult = spell ? (TIER_MULTIPLIERS[spell.tier] ?? 1) : 0;
    const estimatedDamage = spell ? Math.round(spell.baseDamage * tierMult) : 0;
    const elementColor = spell ? (ELEMENT_COLORS[spell.element] ?? "#aaa") : "#aaa";
    const runeUrl = spell ? getRuneImageUrl(spell.element) : "";

    return (
        <div className={styles.panel}>
            <span className={styles.heading}>Spell Preview</span>

            {spell ? (
                <>
                    {/* Spell icon */}
                    <div className={styles.icon} style={{ borderColor: elementColor, borderWidth: 2, borderStyle: "solid" }}>
                        {runeUrl && (
                            <img
                                src={runeUrl}
                                alt={spell.element}
                                className={styles.iconImg}
                            />
                        )}
                    </div>

                    {/* Spell name */}
                    <span className={styles.spellName} style={{ color: elementColor }}>
                        {spell.spellName}
                    </span>

                    {/* Tier */}
                    <span className={styles.tier}>
                        Tier {TIER_LABELS[spell.tier] ?? spell.tier}
                        {spell.isCombo && " (Combo)"}
                    </span>

                    {/* Damage estimate */}
                    <span className={styles.damage}>
                        ~{estimatedDamage} DMG
                    </span>

                    {/* Description */}
                    <span className={styles.description}>
                        {spell.description}
                    </span>

                    {/* Combo elements */}
                    {spell.isCombo && spell.comboElements && (
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
                    )}
                </>
            ) : (
                <span className={styles.empty}>
                    Select runes to preview spell
                </span>
            )}
        </div>
    );
}
