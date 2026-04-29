import { type CSSProperties } from "react";
import {
    useEnemyName,
    useEnemyResistances,
    useEnemyWeaknesses,
    useEnemyIsBoss,
    useEnemyDebuff,
    useSigils,
    useDisabledResistance,
} from "../arkynStore";
import { getDebuffById, getIgnoredResistanceElements } from "../../shared";
import bossFrameUrl from "/assets/ui/boss-frame.png?url";
import {
    createPanelStyleVars,
    INNER_FRAME_BGS,
    ELEMENT_COLORS,
    COLOR_POSITIVE_GREEN,
    COLOR_NEGATIVE_RED,
    COLOR_TEXT_LIGHT_TAN,
} from "./styles";
import { getRuneImageUrl } from "./runeAssets";
import Tooltip from "./Tooltip";
import PanelFrame from "./PanelFrame";
import styles from "./EnemyInfoPanel.module.css";

// `--panel-bg` (frame.png) drives the outer card chrome. `--resist-bg`
// / `--weak-bg` paint a subtle red / green inner-frame UNDER the affinity
// chip content (rendered via a translucent ::before pseudo at low
// opacity) so each chip reads as a soft accent rather than a saturated
// red/green block. The label text colour still carries the primary signal.
const baseStyleVars = {
    ...createPanelStyleVars(),
    "--resist-bg": INNER_FRAME_BGS.red,
    "--weak-bg": INNER_FRAME_BGS.green,
} as CSSProperties;
const bossStyleVars = {
    ...baseStyleVars,
    "--panel-bg": `url(${bossFrameUrl})`,
} as CSSProperties;

type EnemyInfoPanelProps = {
    ref?: React.Ref<HTMLDivElement>;
};

// Floating right-edge panel showing enemy identity: name, boss tag /
// debuff chip, and resists/weaknesses. The HP bar lives in the center
// column above the play area now (see EnemyHealthBar) so the cast →
// damage payoff feels visually contiguous with the rune dissolves and
// total damage count-up.
export default function EnemyInfoPanel({ ref }: EnemyInfoPanelProps = {}) {
    const name = useEnemyName();
    const resistances = useEnemyResistances();
    const weaknesses = useEnemyWeaknesses();
    const isBoss = useEnemyIsBoss();
    const debuffId = useEnemyDebuff();
    const debuff = debuffId ? getDebuffById(debuffId) : undefined;
    // Resistances nullified by owned resist-ignore sigils (Impale-style) or
    // dynamically picked per-round by Binoculars. Each matching chip renders
    // with a red X overlay + dimmed icon to show the player the enemy's
    // resistance is being bypassed.
    const sigils = useSigils();
    const disabledResistance = useDisabledResistance();
    const ignoredResistances = getIgnoredResistanceElements(sigils, disabledResistance);

    return (
        <div className={styles.cardPositioner}>
            <PanelFrame
                ref={ref}
                styleVars={isBoss ? bossStyleVars : baseStyleVars}
                className={styles.card}
            >
                {isBoss ? (
                    <div className={styles.bossHeader}>
                        <span
                            className={styles.bossTag}
                            style={{ "--boss-bg": INNER_FRAME_BGS.gold } as CSSProperties}
                        >
                            BOSS
                        </span>
                        {debuff && (
                            <span
                                className={styles.debuffChip}
                                style={{ "--debuff-bg": INNER_FRAME_BGS.red } as CSSProperties}
                            >
                                {debuff.description}
                            </span>
                        )}
                    </div>
                ) : (
                    <div className={styles.heading}>Enemy</div>
                )}

                {name && (
                    <div className={styles.nameContainer}>
                        <span className={styles.name}>{name}</span>
                    </div>
                )}

                {(resistances.length > 0 || weaknesses.length > 0) && (
                    <div className={styles.affinityRow}>
                        {weaknesses.length > 0 && (
                            <div className={`${styles.section} ${styles.sectionWeak}`}>
                                <AffinitySection
                                    label="Vulnerable"
                                    labelClass={styles.affinityLabelWeak}
                                    elements={weaknesses}
                                    multiplier="2x"
                                    multiplierColor={COLOR_POSITIVE_GREEN}
                                />
                            </div>
                        )}
                        {resistances.length > 0 && (
                            <div className={`${styles.section} ${styles.sectionResist}`}>
                                <AffinitySection
                                    label="Resists"
                                    labelClass={styles.affinityLabelResist}
                                    elements={resistances}
                                    multiplier="0.5x"
                                    multiplierColor={COLOR_NEGATIVE_RED}
                                    ignored={ignoredResistances}
                                />
                            </div>
                        )}
                    </div>
                )}
            </PanelFrame>
        </div>
    );
}

// Single inner-frame chip showing a label ("Resists" / "Weak To") above
// a row of element rune icons.
//
// `ignored` flags elements whose affinity is nullified by an owned sigil
// (e.g. Impale → Steel resistance). Flagged chips render with a red X
// overlay + dimmed icon and swap to a "1x (ignored)" tooltip.
function AffinitySection({ label, labelClass, elements, multiplier, multiplierColor, ignored }: { label: string; labelClass?: string; elements: readonly string[]; multiplier: string; multiplierColor: string; ignored?: ReadonlySet<string> }) {
    return (
        <div className={styles.affinitySection}>
            <span className={`${styles.affinityLabel} ${labelClass ?? ""}`}>{label}</span>
            <div className={styles.affinityIcons}>
                {elements.map(element => {
                    const url = getRuneImageUrl(element);
                    if (!url) return null;
                    const displayName = element.charAt(0).toUpperCase() + element.slice(1);
                    const isIgnored = ignored?.has(element) ?? false;
                    return (
                        <span
                            key={element}
                            className={`${styles.affinityIconWrap} ${isIgnored ? styles.affinityIconIgnored : ""}`}
                        >
                            <img
                                src={url}
                                alt={element}
                                className={styles.affinityIcon}
                            />
                            {isIgnored && <span className={styles.ignoredX} aria-hidden="true" />}
                            <Tooltip placement="left" variant="framed">
                                {isIgnored ? (
                                    <span>
                                        <span className={styles.tooltipMult} style={{ color: COLOR_TEXT_LIGHT_TAN }}>1x</span>
                                        {" damage from "}
                                        <span style={{ color: ELEMENT_COLORS[element] }}>{displayName}</span>
                                        {" (ignored)"}
                                    </span>
                                ) : (
                                    <span>
                                        <span className={styles.tooltipMult} style={{ color: multiplierColor }}>
                                            {multiplier}
                                        </span>
                                        {" damage from "}
                                        <span style={{ color: ELEMENT_COLORS[element] }}>{displayName}</span>
                                    </span>
                                )}
                            </Tooltip>
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
