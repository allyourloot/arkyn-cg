import { useCallback, useEffect, useMemo } from "react";
import {
    ACHIEVEMENT_DEFINITIONS,
    ELEMENT_TYPES,
    type AchievementCategory,
    type AchievementDefinition,
} from "../../shared";
import { useUnlockedAchievements, useLifetimeStats } from "../achievementsStore";
import { useSigils } from "../arkynStore";
import { playMenuClose, playMenuOpen } from "../sfx";
import ItemScene from "./ItemScene";
import { createPanelStyleVars, INNER_FRAME_BGS } from "./styles";
import closeIconUrl from "/assets/icons/close-64x64.png?url";
import closeHoverIconUrl from "/assets/icons/close-hover-64x64.png?url";
import styles from "./AchievementsModal.module.css";

interface AchievementsModalProps {
    onClose: () => void;
}

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
    onboarding: "First Steps",
    progress: "Progress",
    feats: "Feats",
    mastery: "Mastery",
};

const CATEGORY_ORDER: readonly AchievementCategory[] = [
    "onboarding",
    "progress",
    "feats",
    "mastery",
];

// Modal-level CSS vars. Each state plugs its own inner-frame 9-slice into
// the card chrome: the dark navy `default` for locked plaques and green
// for earned. Sections themselves no longer use any chrome — the cards
// carry all the visual structure now.
const modalStyleVars: React.CSSProperties = {
    ...createPanelStyleVars(),
    "--card-frame-locked": INNER_FRAME_BGS.default,
    "--card-frame-earned": INNER_FRAME_BGS.green,
} as React.CSSProperties;

// Maximum stagger before the cards just fall back to a flat reveal. With
// a 25-card registry an unbounded stagger would crawl in over 1.5s; we
// cap so the modal feels alive but never sluggish.
const STAGGER_S = 0.025;
const MAX_STAGGER_S = 0.32;

export default function AchievementsModal({ onClose }: AchievementsModalProps) {
    const unlockedList = useUnlockedAchievements();
    const lifetime = useLifetimeStats();
    const sigils = useSigils();

    const unlockedSet = useMemo(() => new Set(unlockedList), [unlockedList]);

    useEffect(() => {
        playMenuOpen();
    }, []);

    const closeWithSfx = useCallback(() => {
        playMenuClose();
        onClose();
    }, [onClose]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") closeWithSfx();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [closeWithSfx]);

    // Group definitions by category, preserving registry insertion order
    // within each. We also pre-compute per-section earned counts for the
    // section-tally chip so each header reads "3 / 5".
    const grouped = useMemo(() => {
        const out: Record<AchievementCategory, AchievementDefinition[]> = {
            onboarding: [],
            progress: [],
            feats: [],
            mastery: [],
        };
        for (const def of Object.values(ACHIEVEMENT_DEFINITIONS)) {
            out[def.category].push(def);
        }
        return out;
    }, []);

    const total = Object.keys(ACHIEVEMENT_DEFINITIONS).length;
    const unlockedCount = unlockedList.length;

    // Global card index for staggered reveal — counts across sections so
    // the wave reads continuously top-to-bottom rather than restarting per
    // category.
    let cardCounter = 0;

    return (
        <div className={styles.backdrop} onClick={closeWithSfx}>
            <div
                className={styles.modal}
                style={modalStyleVars}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <span className={styles.title}>Achievements</span>
                        <span className={styles.tally}>
                            <span className={styles.tallyValue}>{unlockedCount}</span>
                            <span className={styles.tallySeparator}>/</span>
                            <span className={styles.tallyTotal}>{total}</span>
                            <span className={styles.tallyLabel}>Earned</span>
                        </span>
                    </div>
                    <button
                        type="button"
                        className={styles.closeButton}
                        onClick={closeWithSfx}
                        aria-label="Close achievements"
                    >
                        <img src={closeIconUrl} alt="" className={styles.closeIcon} />
                        <img src={closeHoverIconUrl} alt="" className={styles.closeIconHover} />
                    </button>
                </div>

                <div className={styles.scrollArea}>
                    {CATEGORY_ORDER.map(cat => {
                        const defs = grouped[cat];
                        const sectionEarned = defs.reduce(
                            (n, d) => n + (unlockedSet.has(d.id) ? 1 : 0),
                            0,
                        );
                        const isComplete = sectionEarned === defs.length && defs.length > 0;
                        return (
                            <div key={cat} className={styles.section}>
                                <div className={styles.sectionHeading}>
                                    <span>{CATEGORY_LABELS[cat]}</span>
                                    <span className={styles.sectionDivider} aria-hidden />
                                    <span
                                        className={`${styles.sectionTally}${isComplete ? " " + styles.sectionTallyEarned : ""}`}
                                    >
                                        {sectionEarned} / {defs.length}
                                    </span>
                                </div>
                                <div className={styles.cardGrid}>
                                    {defs.map((def, i) => {
                                        const orderIndex = cardCounter++;
                                        return (
                                            <AchievementCard
                                                key={def.id}
                                                def={def}
                                                index={i}
                                                orderIndex={orderIndex}
                                                isUnlocked={unlockedSet.has(def.id)}
                                                lifetime={lifetime}
                                                sigilsAcquiredThisRun={sigils.length}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

interface AchievementCardProps {
    def: AchievementDefinition;
    /** Position within its category (0-based) — used to seed ItemScene's idle bob. */
    index: number;
    /** Position across the whole modal — drives the staggered fade-in. */
    orderIndex: number;
    isUnlocked: boolean;
    lifetime: ReturnType<typeof useLifetimeStats>;
    sigilsAcquiredThisRun: number;
}

function AchievementCard({
    def,
    index,
    orderIndex,
    isUnlocked,
    lifetime,
    sigilsAcquiredThisRun,
}: AchievementCardProps) {
    // Only cumulative achievements have a `progress` accessor — single-cast
    // feats are binary lock/unlock and skip the bar entirely.
    const progress = useMemo(() => {
        if (!def.progress) return null;
        const elementsCast: Record<string, number> = {};
        ELEMENT_TYPES.forEach((el, i) => {
            if ((lifetime.elementsCastMask & (1 << i)) !== 0) elementsCast[el] = 1;
        });
        return def.progress({
            trigger: "first_load",
            lifetime: {
                totalCasts: lifetime.totalCasts,
                totalDiscards: lifetime.totalDiscards,
                totalRuns: lifetime.totalRuns,
                totalEnemiesDefeated: lifetime.totalEnemiesDefeated,
                totalGoldEarned: lifetime.totalGoldEarned,
                runePacksOpened: lifetime.runePacksOpened,
                auguryPacksOpened: lifetime.auguryPacksOpened,
                sigilsSold: lifetime.sigilsSold,
                elementsCast,
            },
            run: null,
            cast: null,
            enemyDefeat: null,
            pack: null,
            ownedSigilCount: sigilsAcquiredThisRun,
        });
    }, [def, lifetime, sigilsAcquiredThisRun]);

    const cardClass = isUnlocked
        ? `${styles.card} ${styles.cardEarned}`
        : `${styles.card} ${styles.cardLocked}`;

    const delaySeconds = Math.min(orderIndex * STAGGER_S, MAX_STAGGER_S);
    const cardStyle: React.CSSProperties = {
        animationDelay: `${delaySeconds.toFixed(3)}s`,
    };

    // Right-side visual: sigil thumbnail when this achievement gates one,
    // else nothing (the bottom progress bar carries the load when present).
    const rightSlot = def.unlocksSigilId
        ? isUnlocked
            ? (
                <div className={styles.sigilWrap}>
                    <ItemScene
                        itemId={def.unlocksSigilId}
                        index={index}
                        className={styles.sigilCanvas}
                        smoothIdle
                    />
                </div>
            )
            : (
                <div
                    className={styles.sigilHidden}
                    title="Sigil reward — earn the achievement to reveal."
                    aria-label="Hidden sigil reward"
                >
                    <span className={styles.sigilHiddenGlyph}>?</span>
                </div>
            )
        : null;

    return (
        <div className={cardClass} style={cardStyle}>
            <div className={styles.cardHeader}>
                <span className={styles.cardName}>{def.name}</span>
                <span className={styles.cardStatus}>{isUnlocked ? "Earned" : "Locked"}</span>
            </div>
            <div className={styles.cardBody}>
                <p className={styles.cardDescription}>{def.description}</p>
                {rightSlot}
            </div>
            {progress && (
                <ProgressTrack progress={progress} unlocked={isUnlocked} />
            )}
        </div>
    );
}

function ProgressTrack({
    progress,
    unlocked,
}: {
    progress: readonly [number, number];
    unlocked: boolean;
}) {
    const [cur, target] = progress;
    const pct = target > 0 ? Math.min(100, Math.round((cur / target) * 100)) : 0;
    const display = unlocked
        ? "Complete"
        : `${Math.min(cur, target).toLocaleString()} / ${target.toLocaleString()}`;
    return (
        <>
            <div className={styles.progressMeta}>
                <span className={styles.progressMetaLabel}>{display}</span>
            </div>
            <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${pct}%` }} />
            </div>
        </>
    );
}
