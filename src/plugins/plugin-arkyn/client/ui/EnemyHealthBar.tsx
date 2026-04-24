import { useEffect, useRef, useState, type CSSProperties } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
    useDisplayedEnemyHp,
    useEnemyMaxHp,
    useEnemyDamageHit,
    useEnemyName,
    useEnemyResistances,
    useEnemyWeaknesses,
    useEnemyIsBoss,
    useEnemyDebuff,
    useSigils,
    useDisabledResistance,
    BAR_SHAKE_FRAME_S,
} from "../arkynStore";
import { getDebuffById, getIgnoredResistanceElements } from "../../shared";
import bossFrameUrl from "/assets/ui/boss-frame.png?url";
import { ELEMENT_COLORS, createPanelStyleVars, INNER_FRAME_BGS } from "./styles";
import { getRuneImageUrl } from "./runeAssets";
import Tooltip from "./Tooltip";
import { playCritical } from "../sfx";
import criticalUrl from "/assets/ui/critical.png?url";
import executeUrl from "/assets/ui/execute.png?url";
import styles from "./EnemyHealthBar.module.css";

// `--panel-bg` (frame.png) drives the bar chrome; `--section-bg`
// (inner-frame.png) drives the Resists / Weak To frames below the bar.
const baseStyleVars = createPanelStyleVars();
const bossStyleVars = {
    ...baseStyleVars,
    "--panel-bg": `url(${bossFrameUrl})`,
} as CSSProperties;

interface ActiveHit {
    amount: number;
    spellElement: string;
    isCritical: boolean;
    /**
     * True when Blackjack's execute proc landed this cast — swaps the
     * critical-burst background for the execute variant (red on green
     * instead of yellow). Same shape, distinct read, no impact on the
     * displayed damage number.
     */
    isExecute: boolean;
    seq: number;
}

type EnemyHealthBarProps = {
    ref?: React.Ref<HTMLDivElement>;
};

export default function EnemyHealthBar({ ref: externalRef }: EnemyHealthBarProps = {}) {
    // The bar reads the "displayed" HP, which lags behind the server's
    // authoritative `enemyHp` during a cast animation so the damage
    // drops in sync with the dissolve finale (not when the cast is sent).
    const hp = useDisplayedEnemyHp();
    const maxHp = useEnemyMaxHp();
    const enemyDamageHit = useEnemyDamageHit();
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

    // wrapperRef scopes the GSAP context for cleanup; the actual shake
    // target is the inner barShakeRef so the name above and the affinity
    // sections below stay rock-solid when the enemy gets hit.
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Merge our internal wrapperRef with the optional ref forwarded from
    // ArkynOverlay (used to drive screen-transition slide animations).
    const setWrapperRef = (el: HTMLDivElement | null) => {
        wrapperRef.current = el;
        if (typeof externalRef === "function") {
            externalRef(el);
        } else if (externalRef) {
            (externalRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }
    };
    const barShakeRef = useRef<HTMLDivElement>(null);
    const damageFloatRef = useRef<HTMLSpanElement>(null);

    // Local active hit drives the conditional render of the floating
    // damage number. Re-keys on `seq` so identical back-to-back casts
    // still re-trigger the animation. Cleared via the GSAP timeline's
    // onComplete (instead of a setTimeout) so the float and the bar
    // shake share the exact same lifetime.
    const [activeHit, setActiveHit] = useState<ActiveHit | null>(null);

    // Baseline the seq we last processed to whatever the global store holds
    // at mount time. The store keeps the previous round's hit alive across
    // shop transitions (this component unmounts in the shop), so without
    // this guard the next round's first render would replay the previous
    // round's damage bubble + critical SFX against the fresh enemy.
    const lastProcessedSeqRef = useRef<number>(enemyDamageHit.seq);

    // Mount the active hit when a new damage event arrives.
    useEffect(() => {
        if (enemyDamageHit.seq === lastProcessedSeqRef.current) return;
        lastProcessedSeqRef.current = enemyDamageHit.seq;
        if (enemyDamageHit.seq === 0) return;
        setActiveHit({
            amount: enemyDamageHit.amount,
            spellElement: enemyDamageHit.spellElement,
            isCritical: enemyDamageHit.isCritical,
            isExecute: enemyDamageHit.isExecute,
            seq: enemyDamageHit.seq,
        });
        // Play the critical sfx in sync with the floating damage number
        // on critical hits — matches the per-rune bubble behavior in the
        // play area so the final impact feels just as punchy. Skipped on
        // executes (the bell + blackjack stinger already filled that slot).
        if (enemyDamageHit.isCritical && !enemyDamageHit.isExecute) {
            playCritical();
        }
    }, [enemyDamageHit.seq, enemyDamageHit.amount, enemyDamageHit.spellElement, enemyDamageHit.isCritical, enemyDamageHit.isExecute]);

    // GSAP-driven shake + floating damage tween. Fires whenever activeHit
    // gets a new seq. The bar wrapper does the side-to-side shake; the
    // floating damage span does the pop / drift / fade. Both share the
    // same `onComplete` so the float unmounts when the shake ends.
    useGSAP(() => {
        if (!activeHit) return;
        const shake = barShakeRef.current;
        const float = damageFloatRef.current;

        // Bar shake — stepped left/right with diminishing amplitude.
        // Targets the inner .barShake element so only the bar reacts;
        // the name and affinity frames stay still.
        if (shake) {
            gsap.set(shake, { x: 0 });
            gsap.to(shake, {
                keyframes: [
                    { x: -7, duration: BAR_SHAKE_FRAME_S },
                    { x: 7, duration: BAR_SHAKE_FRAME_S },
                    { x: -6, duration: BAR_SHAKE_FRAME_S },
                    { x: 6, duration: BAR_SHAKE_FRAME_S },
                    { x: -4, duration: BAR_SHAKE_FRAME_S },
                    { x: 4, duration: BAR_SHAKE_FRAME_S },
                    { x: -2, duration: BAR_SHAKE_FRAME_S },
                    { x: 2, duration: BAR_SHAKE_FRAME_S },
                    { x: -1, duration: BAR_SHAKE_FRAME_S },
                    { x: 0, duration: BAR_SHAKE_FRAME_S },
                ],
                ease: "power2.out",
                overwrite: "auto",
            });
        }

        // Floating damage number — entrance pop, brief settle, drift up,
        // fade out. Mirrors the four-stop shape of the previous CSS
        // @keyframes enemyDamageFloat. The whole tween is ~0.9s and on
        // completion clears `activeHit` so the span unmounts.
        if (float) {
            gsap.set(float, { x: 0, y: 0, scale: 0.5, opacity: 0 });
            const tl = gsap.timeline({
                onComplete: () => setActiveHit(null),
            });
            tl.to(float, {
                x: 10,
                y: -6,
                scale: 1.25,
                opacity: 1,
                duration: 0.135,
                ease: "back.out(2)",
            })
                .to(float, {
                    x: 18,
                    y: -10,
                    scale: 1,
                    duration: 0.117,
                    ease: "power2.out",
                })
                .to(float, {
                    x: 50,
                    y: -28,
                    duration: 0.45,
                    ease: "power1.out",
                })
                .to(float, {
                    x: 64,
                    y: -36,
                    scale: 0.92,
                    opacity: 0,
                    duration: 0.198,
                    ease: "power1.in",
                });
        }
    }, { dependencies: [activeHit?.seq], scope: wrapperRef });

    if (maxHp <= 0) return null;

    const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));

    // Color transitions based on HP percentage
    let barColor = "#22c55e"; // green
    if (pct < 60) barColor = "#eab308"; // yellow
    if (pct < 35) barColor = "#f97316"; // orange
    if (pct < 15) barColor = "#ef4444"; // red

    // Outline color follows the spell that produced the hit so the floating
    // number reads as part of the same impact as the per-rune bubbles.
    const damageStrokeColor = activeHit
        ? ELEMENT_COLORS[activeHit.spellElement] ?? "#ffffff"
        : "#ffffff";
    const damageFloatStyle = { "--stroke-color": damageStrokeColor } as CSSProperties;

    return (
        <div ref={setWrapperRef} className={styles.wrapper} style={isBoss ? bossStyleVars : baseStyleVars}>
            <div className={styles.nameContainer}>
                {isBoss && (
                    <div className={styles.bossRow}>
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
                )}
                {name && <span className={styles.name}>{name}</span>}
            </div>

            <div className={styles.barRow}>
                {resistances.length > 0 ? (
                    <AffinitySection label="Resists" labelClass={styles.affinityLabelResist} elements={resistances} multiplier="0.5x" multiplierColor="#ef4444" ignored={ignoredResistances} />
                ) : (
                    <div className={styles.affinitySpacer} />
                )}

                <div ref={barShakeRef} className={styles.barShake}>
                    <div className={styles.barAnchor}>
                        <div className={styles.barOuter}>
                            <div
                                className={styles.barFill}
                                style={{ width: `${pct}%`, backgroundColor: barColor }}
                            />
                            <span className={styles.barText}>
                                {hp} / {maxHp}
                            </span>
                        </div>
                        {activeHit && (
                            <span
                                ref={damageFloatRef}
                                key={activeHit.seq}
                                className={styles.damageFloat}
                                style={damageFloatStyle}
                            >
                                {(activeHit.isExecute || activeHit.isCritical) && (
                                    <img
                                        src={activeHit.isExecute ? executeUrl : criticalUrl}
                                        alt=""
                                        className={styles.criticalBg}
                                    />
                                )}
                                -{activeHit.amount}
                            </span>
                        )}
                    </div>
                </div>

                {weaknesses.length > 0 ? (
                    <AffinitySection label="Vulnerable" labelClass={styles.affinityLabelWeak} elements={weaknesses} multiplier="2x" multiplierColor="#4ade80" />
                ) : (
                    <div className={styles.affinitySpacer} />
                )}
            </div>
        </div>
    );
}

// Single inner-frame chip showing a label ("Resists" / "Weak To") above
// a row of element rune icons. Lives inside EnemyHealthBar so the visual
// chrome stays alongside the bar it describes.
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
                            <Tooltip placement="bottom" variant="framed">
                                {isIgnored ? (
                                    <>
                                        <span className={styles.tooltipMult} style={{ color: "#e8d4b8" }}>1x</span>
                                        {` damage from ${displayName} (ignored)`}
                                    </>
                                ) : (
                                    <>
                                        <span className={styles.tooltipMult} style={{ color: multiplierColor }}>
                                            {multiplier}
                                        </span>
                                        {` damage from ${displayName}`}
                                    </>
                                )}
                            </Tooltip>
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
