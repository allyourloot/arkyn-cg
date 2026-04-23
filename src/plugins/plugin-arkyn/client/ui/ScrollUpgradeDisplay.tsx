import { useState, useEffect } from "react";
import { SCROLL_RUNE_BONUS } from "../../shared/arkynConstants";
import RuneImage from "./RuneImage";
import BouncyText from "./BouncyText";
import styles from "./ScrollUpgradeDisplay.module.css";

interface ScrollUpgradeDisplayProps {
    element: string;
    oldLevel: number;
    newLevel: number;
    /**
     * - "overlay": absolute-positioned, fills parent. Used by SpellPreview
     *   so appearing during gameplay doesn't shift the damage chips below.
     *   Requires the parent to have `position: relative`.
     * - "inline": flex-layout, stretches to parent width. Used by ShopPanel
     *   where nothing else shares the upgradeArea.
     */
    variant: "overlay" | "inline";
}

/**
 * Shows the scroll's per-rune flat bonus ticking from old → new. Scrolls
 * stack as a flat additive bonus to every matching-element rune,
 * REGARDLESS of rarity (same +2 whether it hits a common or a legendary) —
 * display the additive bonus directly rather than framing it as a
 * rarity-dependent base replacement.
 */
export default function ScrollUpgradeDisplay({
    element,
    oldLevel,
    newLevel,
    variant,
}: ScrollUpgradeDisplayProps) {
    const oldBonus = (oldLevel - 1) * SCROLL_RUNE_BONUS;
    const newBonus = (newLevel - 1) * SCROLL_RUNE_BONUS;

    const [showUpgraded, setShowUpgraded] = useState(false);
    useEffect(() => {
        setShowUpgraded(false);
        const t = setTimeout(() => setShowUpgraded(true), 600);
        return () => clearTimeout(t);
    }, [element, oldLevel, newLevel]);

    return (
        <div className={`${styles.upgradeContent} ${styles[variant]}`}>
            <div className={styles.upgradeRow}>
                <div className={styles.upgradeRuneIcon}>
                    <RuneImage rarity="common" element={element} className={styles.upgradeRuneImg} />
                </div>
                <div className={styles.upgradeRuneInfo}>
                    <span className={styles.upgradeRuneDamageLabel}>Per Rune Bonus</span>
                    <div className={styles.upgradeRuneDamageRow}>
                        <BouncyText className={styles.upgradeRuneDamageOld}>
                            {`+${oldBonus}`}
                        </BouncyText>
                        {showUpgraded && (
                            <span className={styles.upgradeRuneDamageResult}>
                                <span className={styles.upgradeRuneDamageArrow}>→</span>
                                <BouncyText className={styles.upgradeRuneDamageNew}>
                                    {`+${newBonus}`}
                                </BouncyText>
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
