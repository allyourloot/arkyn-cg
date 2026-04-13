import { useRef, useState, useEffect, type CSSProperties } from "react";
import { gsap } from "gsap";
import {
    CASTS_PER_ROUND,
    DISCARDS_PER_ROUND,
    getDebuffById,
    getPlayerStatDeltas,
    RUNE_BASE_DAMAGE,
} from "../../shared";
import { SCROLL_RUNE_BONUS } from "../../shared/arkynConstants";
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
    useScrollUpgradeDisplay,
    useSigils,
} from "../arkynStore";
import { ELEMENT_COLORS, createPanelStyleVars } from "./styles";
import { getRuneImageUrl } from "./runeAssets";
import RuneImage from "./RuneImage";
import BouncyText from "./BouncyText";
import GoldCounter from "./GoldCounter";
import innerFrameGreenUrl from "/assets/ui/inner-frame-green.png?url";
import innerFrameOrangeUrl from "/assets/ui/inner-frame-orange.png?url";
import styles from "./ShopPanel.module.css";

const panelStyleVars = {
    ...createPanelStyleVars(),
    ["--hands-bg" as string]: `url(${innerFrameGreenUrl})`,
    ["--discards-bg" as string]: `url(${innerFrameOrangeUrl})`,
    ["--shop-chip-bg" as string]: `url(${innerFrameOrangeUrl})`,
} as CSSProperties;

type ShopPanelProps = {
    ref?: React.Ref<HTMLDivElement>;
};

export default function ShopPanel({ ref }: ShopPanelProps = {}) {
    const currentRound = useCurrentRound();
    const gamePhase = useGamePhase();
    const upgradeDisplay = useScrollUpgradeDisplay();

    const snapshotRoundRef = useRef(currentRound);
    if (gamePhase === "shop") {
        snapshotRoundRef.current = currentRound;
    }
    const nextRound = Math.max(1, snapshotRoundRef.current + 1);

    const enemyName = useEnemyName();
    const enemyMaxHp = useEnemyMaxHp();
    const enemyElement = useEnemyElement();
    const resistances = useEnemyResistances();
    const weaknesses = useEnemyWeaknesses();
    const isBoss = useEnemyIsBoss();
    const debuffId = useEnemyDebuff();
    const debuff = debuffId ? getDebuffById(debuffId) : undefined;
    const sigils = useSigils();
    const statDeltas = getPlayerStatDeltas(sigils);
    const effectiveCasts = CASTS_PER_ROUND + statDeltas.castsPerRound;
    const effectiveDiscards = DISCARDS_PER_ROUND + statDeltas.discardsPerRound;

    // "+1" flash when effectiveCasts increases (e.g. Caster sigil bought).
    // Briefly swaps the chip text to "+1" in the same style, then shows
    // the new total.
    const prevCastsRef = useRef(effectiveCasts);
    const [castsDisplay, setCastsDisplay] = useState<string>(String(effectiveCasts));
    const chipRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const prev = prevCastsRef.current;
        prevCastsRef.current = effectiveCasts;
        if (effectiveCasts <= prev) {
            setCastsDisplay(String(effectiveCasts));
            return;
        }

        // Flash "+1" then update to new total
        setCastsDisplay(`+${effectiveCasts - prev}`);
        if (chipRef.current) {
            gsap.fromTo(chipRef.current,
                { scale: 1 },
                { scale: 1.15, duration: 0.12, ease: "power2.out", yoyo: true, repeat: 1 },
            );
        }
        const t = setTimeout(() => setCastsDisplay(String(effectiveCasts)), 500);
        return () => clearTimeout(t);
    }, [effectiveCasts]);

    const elementColor = ELEMENT_COLORS[enemyElement] ?? "#c4a882";
    const elementIconUrl = getRuneImageUrl(enemyElement);

    return (
        <div ref={ref} className={styles.panel} style={panelStyleVars}>
            {/* --- Top: Shop chip + enemy preview --- */}
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

            {/* --- Middle: Upgrade display area (flex: 1) --- */}
            <div className={styles.upgradeArea}>
                {upgradeDisplay && (
                    <UpgradeSection
                        element={upgradeDisplay.element}
                        oldLevel={upgradeDisplay.oldLevel}
                        newLevel={upgradeDisplay.newLevel}
                    />
                )}
            </div>

            {/* --- Bottom: Stats + Gold (pinned via margin-top: auto) --- */}
            <div className={styles.bottomSection}>
                <div className={styles.statsSection}>
                    <div className={styles.statsRow}>
                        <div className={styles.statColumn}>
                            <span className={styles.statLabel}>Casts</span>
                            <div
                                ref={chipRef}
                                className={`${styles.statChip} ${styles.statChipHands}`}
                            >
                                <BouncyText className={styles.statChipValue}>
                                    {castsDisplay}
                                </BouncyText>
                            </div>
                        </div>
                        <div className={styles.statColumn}>
                            <span className={styles.statLabel}>Discards</span>
                            <div className={`${styles.statChip} ${styles.statChipDiscards}`}>
                                <BouncyText className={styles.statChipValue}>
                                    {effectiveDiscards}
                                </BouncyText>
                            </div>
                        </div>
                    </div>
                </div>
                <GoldCounter />
            </div>
        </div>
    );
}

/**
 * Upgrade info shown in the middle area after buying a scroll.
 * Shows the rune image with its base damage changing from old → new.
 */
function UpgradeSection({
    element,
    oldLevel,
    newLevel,
}: {
    element: string;
    oldLevel: number;
    newLevel: number;
}) {
    // Rune base damage before and after this scroll purchase
    const runeBase = RUNE_BASE_DAMAGE.common; // all runes are common for now
    const oldScrollCount = oldLevel - 1;
    const newScrollCount = newLevel - 1;
    const oldRuneDamage = runeBase + oldScrollCount * SCROLL_RUNE_BONUS;
    const newRuneDamage = runeBase + newScrollCount * SCROLL_RUNE_BONUS;

    // Animate from old → new after a delay
    const [showUpgraded, setShowUpgraded] = useState(false);
    useEffect(() => {
        setShowUpgraded(false);
        const t = setTimeout(() => setShowUpgraded(true), 600);
        return () => clearTimeout(t);
    }, [element, oldLevel, newLevel]);

    const displayDamage = showUpgraded ? newRuneDamage : oldRuneDamage;

    return (
        <div className={styles.upgradeContent}>
            <div className={styles.upgradeRow}>
                <div className={styles.upgradeRuneIcon}>
                    <RuneImage rarity="common" element={element} className={styles.upgradeRuneImg} />
                </div>
                <div className={styles.upgradeRuneInfo}>
                    <span className={styles.upgradeRuneDamageLabel}>Base Damage</span>
                    <div className={styles.upgradeRuneDamageRow}>
                        <BouncyText className={styles.upgradeRuneDamageOld}>
                            {`${oldRuneDamage}`}
                        </BouncyText>
                        {showUpgraded && (
                            <span className={styles.upgradeRuneDamageResult}>
                                <span className={styles.upgradeRuneDamageArrow}>→</span>
                                <BouncyText className={styles.upgradeRuneDamageNew}>
                                    {`${newRuneDamage}`}
                                </BouncyText>
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

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
