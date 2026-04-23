import { useRef, useState, useEffect, type CSSProperties } from "react";
import { gsap } from "gsap";
import {
    CASTS_PER_ROUND,
    DISCARDS_PER_ROUND,
    getDebuffById,
    getPlayerStatDeltas,
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
    useScrollUpgradeDisplay,
    useSigils,
} from "../arkynStore";
import { ELEMENT_COLORS, createPanelStyleVars, INNER_FRAME_BGS } from "./styles";
import { getRuneImageUrl } from "./runeAssets";
import BouncyText from "./BouncyText";
import StatBentoRow from "./StatBentoRow";
import ScrollUpgradeDisplay from "./ScrollUpgradeDisplay";
import styles from "./ShopPanel.module.css";

const panelStyleVars = {
    ...createPanelStyleVars(),
    ["--hands-bg" as string]: INNER_FRAME_BGS.green,
    ["--discards-bg" as string]: INNER_FRAME_BGS.orange,
    ["--shop-chip-bg" as string]: INNER_FRAME_BGS.orange,
    ["--bank-bg" as string]: INNER_FRAME_BGS.default,
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

            {/* Section swaps between the enemy preview and the scroll-upgrade
                display, mirroring SpellPreview's pattern. Keeps the upgrade
                animation inside the panel's fixed 30vh section so the
                bento / casts / gold chips below don't shift when a scroll
                is bought or used. */}
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
                    </>
                )}
            </div>

            {/* --- Bottom: Bento row — Gold (left 70%) + Casts/Discards stacked (right 30%) --- */}
            <StatBentoRow
                castsValue={castsDisplay}
                discardsValue={effectiveDiscards}
                castsChipRef={chipRef}
            />
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
