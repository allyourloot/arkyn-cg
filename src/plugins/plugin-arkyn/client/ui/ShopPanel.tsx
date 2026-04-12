import { useRef, type CSSProperties } from "react";
import {
    CASTS_PER_ROUND,
    DISCARDS_PER_ROUND,
    getDebuffById,
} from "../../shared";
import {
    useCurrentRound,
    useGamePhase,
    useEnemyName,
    useEnemyMaxHp,
    useEnemyElement,
    useEnemyResistances,
    useEnemyWeaknesses,
    useEnemyIsBoss,
    useEnemyDebuff,
} from "../arkynStore";
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
 *   3. Next-enemy preview: element rune + name + HP + debuff + resist/weak
 *   4. Hands (green) + Discards (orange) total chips
 *   5. Gold counter pinned to the bottom
 *
 * The next enemy is pre-spawned on the server when entering the shop
 * phase, so we read all enemy info — including boss debuff — from the
 * live synced state. The round counter hasn't been incremented yet,
 * so we still display `currentRound + 1` for the round label.
 */
type ShopPanelProps = {
    ref?: React.Ref<HTMLDivElement>;
};

export default function ShopPanel({ ref }: ShopPanelProps = {}) {
    const currentRound = useCurrentRound();
    const gamePhase = useGamePhase();

    // Snapshot the round while we're in the shop phase. Once the server
    // flips to "playing" (and increments currentRound), the panel is still
    // mounted during the exit animation — using the live currentRound would
    // flash the *next* next enemy. Freezing on the snapshot avoids that.
    const snapshotRoundRef = useRef(currentRound);
    if (gamePhase === "shop") {
        snapshotRoundRef.current = currentRound;
    }
    const nextRound = Math.max(1, snapshotRoundRef.current + 1);

    // Read from the live synced enemy state (pre-spawned on shop entry)
    // so boss debuff info and fortified HP are accurate.
    const enemyName = useEnemyName();
    const enemyMaxHp = useEnemyMaxHp();
    const enemyElement = useEnemyElement();
    const resistances = useEnemyResistances();
    const weaknesses = useEnemyWeaknesses();
    const isBoss = useEnemyIsBoss();
    const debuffId = useEnemyDebuff();
    const debuff = debuffId ? getDebuffById(debuffId) : undefined;

    const elementColor = ELEMENT_COLORS[enemyElement] ?? "#c4a882";
    const elementIconUrl = getRuneImageUrl(enemyElement);

    return (
        <div ref={ref} className={styles.panel} style={panelStyleVars}>
            <div className={styles.shopChip}>
                <BouncyText className={styles.shopChipLabel}>Shop</BouncyText>
            </div>

            <span className={styles.heading}>Next Enemy</span>

            <div className={styles.section}>
                {elementIconUrl && (
                    <img
                        src={elementIconUrl}
                        alt={enemyElement}
                        className={styles.enemyIcon}
                    />
                )}
                <BouncyText
                    className={styles.enemyName}
                    style={{ color: elementColor }}
                >
                    {enemyName}
                </BouncyText>
                <span className={styles.enemyRound}>
                    <BouncyText>{`Round ${nextRound}`}</BouncyText>
                </span>
                {isBoss && (
                    <span className={styles.bossWarning}>
                        <BouncyText>Boss Round</BouncyText>
                    </span>
                )}
                <span className={styles.enemyHp}>
                    <BouncyText>{`${enemyMaxHp} HP`}</BouncyText>
                </span>
                {debuff && (
                    <span className={styles.debuffChip}>
                        <BouncyText>{debuff.description}</BouncyText>
                    </span>
                )}

                {(resistances.length > 0 || weaknesses.length > 0) && (
                    <div className={styles.affinityContainer}>
                        {resistances.length > 0 && (
                            <AffinitySection
                                label="Resists"
                                labelClass={styles.affinityLabelResist}
                                elements={resistances}
                            />
                        )}
                        {weaknesses.length > 0 && (
                            <AffinitySection
                                label="Vulnerable"
                                labelClass={styles.affinityLabelWeak}
                                elements={weaknesses}
                            />
                        )}
                    </div>
                )}
            </div>

            <div className={styles.statsSection}>
                <div className={styles.statsRow}>
                    <div className={styles.statColumn}>
                        <span className={styles.statLabel}>Casts</span>
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
