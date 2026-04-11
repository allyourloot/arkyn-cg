import type { CSSProperties } from "react";
import {
    CASTS_PER_ROUND,
    DISCARDS_PER_ROUND,
    getEnemyForRound,
} from "../../shared";
import { useCurrentRound } from "../arkynStore";
import { ELEMENT_COLORS, createPanelStyleVars } from "./styles";
import { getRuneImageUrl } from "./runeAssets";
import BouncyText from "./BouncyText";
import GoldCounter from "./GoldCounter";
import innerFrameGreenUrl from "/assets/ui/inner-frame-green.png?url";
import innerFrameOrangeUrl from "/assets/ui/inner-frame-orange.png?url";
import styles from "./ShopPanel.module.css";

// Panel chrome (frame + section) plus two custom inner-frame variables
// for the Hands (green) and Discards (orange) stat chips below. Pattern
// mirrors SpellPreview's damage chip wiring so the shop panel reads as
// a sibling of the preview panel.
const panelStyleVars = {
    ...createPanelStyleVars(),
    ["--hands-bg" as string]: `url(${innerFrameGreenUrl})`,
    ["--discards-bg" as string]: `url(${innerFrameOrangeUrl})`,
    ["--shop-chip-bg" as string]: `url(${innerFrameOrangeUrl})`,
} as CSSProperties;

/**
 * Left-side panel shown in place of SpellPreview while the player is in
 * the Shop phase. Matches SpellPreview's outer shell (width, height,
 * 9-slice frame chrome) so it reads as a variant of the same panel.
 *
 * Layout, top to bottom:
 *   1. Shop header chip (orange inner-frame)
 *   2. "NEXT ENEMY" heading label
 *   3. Next-enemy preview: big element rune + name + HP + resist/weak chips
 *   4. Hands (green) + Discards (orange) total chips
 *   5. Gold counter pinned to the bottom
 *
 * The next-enemy preview reads from `getEnemyForRound(currentRound + 1)`
 * — during the shop phase the server hasn't yet incremented the round, so
 * adding 1 gives us the enemy the player is about to face.
 */
export default function ShopPanel() {
    const currentRound = useCurrentRound();
    // Shop runs between rounds: currentRound is still the round that was
    // just completed, so +1 is the upcoming encounter.
    const nextRound = Math.max(1, currentRound + 1);
    const nextEnemy = getEnemyForRound(nextRound);
    const elementColor = ELEMENT_COLORS[nextEnemy.element] ?? "#c4a882";
    const elementIconUrl = getRuneImageUrl(nextEnemy.element);

    return (
        <div className={styles.panel} style={panelStyleVars}>
            <div className={styles.shopChip}>
                <BouncyText className={styles.shopChipLabel}>Shop</BouncyText>
            </div>

            <span className={styles.heading}>Next Enemy</span>

            <div className={styles.section}>
                {elementIconUrl && (
                    <img
                        src={elementIconUrl}
                        alt={nextEnemy.element}
                        className={styles.enemyIcon}
                    />
                )}
                <BouncyText
                    className={styles.enemyName}
                    style={{ color: elementColor }}
                >
                    {nextEnemy.name}
                </BouncyText>
                <span className={styles.enemyRound}>
                    <BouncyText>{`Round ${nextRound}`}</BouncyText>
                </span>
                <span className={styles.enemyHp}>
                    <BouncyText>{`${nextEnemy.hp} HP`}</BouncyText>
                </span>

                {(nextEnemy.resistances.length > 0 || nextEnemy.weaknesses.length > 0) && (
                    <div className={styles.affinityContainer}>
                        {nextEnemy.resistances.length > 0 && (
                            <AffinitySection
                                label="Resists"
                                labelClass={styles.affinityLabelResist}
                                elements={nextEnemy.resistances}
                            />
                        )}
                        {nextEnemy.weaknesses.length > 0 && (
                            <AffinitySection
                                label="Vulnerable"
                                labelClass={styles.affinityLabelWeak}
                                elements={nextEnemy.weaknesses}
                            />
                        )}
                    </div>
                )}
            </div>

            <div className={styles.statsSection}>
                <div className={styles.statsRow}>
                    <div className={styles.statColumn}>
                        <span className={styles.statLabel}>Hands</span>
                        <div className={`${styles.statChip} ${styles.statChipHands}`}>
                            <BouncyText className={styles.statChipValue}>
                                {CASTS_PER_ROUND}
                            </BouncyText>
                        </div>
                    </div>
                    <div className={styles.statColumn}>
                        <span className={styles.statLabel}>Discards</span>
                        <div className={`${styles.statChip} ${styles.statChipDiscards}`}>
                            <BouncyText className={styles.statChipValue}>
                                {DISCARDS_PER_ROUND}
                            </BouncyText>
                        </div>
                    </div>
                </div>
            </div>

            <GoldCounter />
        </div>
    );
}

// Inline resist/weakness chip — stripped-down version of EnemyHealthBar's
// AffinitySection sized for the narrower shop panel. Uses a plain element
// rune icon row with an uppercase label above.
function AffinitySection({
    label,
    labelClass,
    elements,
}: {
    label: string;
    labelClass?: string;
    elements: readonly string[];
}) {
    return (
        <div className={styles.affinitySection}>
            <span className={`${styles.affinityLabel} ${labelClass ?? ""}`}>{label}</span>
            <div className={styles.affinityIcons}>
                {elements.map((element) => {
                    const url = getRuneImageUrl(element);
                    if (!url) return null;
                    return (
                        <img
                            key={element}
                            src={url}
                            alt={element}
                            className={styles.affinityIcon}
                        />
                    );
                })}
            </div>
        </div>
    );
}
