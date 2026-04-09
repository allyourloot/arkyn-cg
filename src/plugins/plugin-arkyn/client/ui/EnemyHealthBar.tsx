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
} from "../arkynStore";
import { ELEMENT_COLORS, createPanelStyleVars } from "./styles";
import { getRuneImageUrl } from "./runeAssets";
import styles from "./EnemyHealthBar.module.css";

// `--panel-bg` (frame.png) drives the bar chrome; `--section-bg`
// (inner-frame.png) drives the Resists / Weak To frames below the bar.
const wrapperStyleVars = createPanelStyleVars();

interface ActiveHit {
    amount: number;
    spellElement: string;
    seq: number;
}

export default function EnemyHealthBar() {
    // The bar reads the "displayed" HP, which lags behind the server's
    // authoritative `enemyHp` during a cast animation so the damage
    // drops in sync with the dissolve finale (not when the cast is sent).
    const hp = useDisplayedEnemyHp();
    const maxHp = useEnemyMaxHp();
    const enemyDamageHit = useEnemyDamageHit();
    const name = useEnemyName();
    const resistances = useEnemyResistances();
    const weaknesses = useEnemyWeaknesses();

    // wrapperRef scopes the GSAP context for cleanup; the actual shake
    // target is the inner barShakeRef so the name above and the affinity
    // sections below stay rock-solid when the enemy gets hit.
    const wrapperRef = useRef<HTMLDivElement>(null);
    const barShakeRef = useRef<HTMLDivElement>(null);
    const damageFloatRef = useRef<HTMLSpanElement>(null);

    // Local active hit drives the conditional render of the floating
    // damage number. Re-keys on `seq` so identical back-to-back casts
    // still re-trigger the animation. Cleared via the GSAP timeline's
    // onComplete (instead of a setTimeout) so the float and the bar
    // shake share the exact same lifetime.
    const [activeHit, setActiveHit] = useState<ActiveHit | null>(null);

    // Mount the active hit when a new damage event arrives.
    useEffect(() => {
        if (enemyDamageHit.seq === 0) return;
        setActiveHit({
            amount: enemyDamageHit.amount,
            spellElement: enemyDamageHit.spellElement,
            seq: enemyDamageHit.seq,
        });
    }, [enemyDamageHit.seq, enemyDamageHit.amount, enemyDamageHit.spellElement]);

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
                    { x: -7, duration: 0.036 },
                    { x: 7, duration: 0.036 },
                    { x: -6, duration: 0.036 },
                    { x: 6, duration: 0.036 },
                    { x: -4, duration: 0.036 },
                    { x: 4, duration: 0.036 },
                    { x: -2, duration: 0.036 },
                    { x: 2, duration: 0.036 },
                    { x: -1, duration: 0.036 },
                    { x: 0, duration: 0.036 },
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
            gsap.set(float, { xPercent: -50, y: 18, scale: 0.5, opacity: 0 });
            const tl = gsap.timeline({
                onComplete: () => setActiveHit(null),
            });
            tl.to(float, {
                y: -8,
                scale: 1.25,
                opacity: 1,
                duration: 0.135,
                ease: "back.out(2)",
            })
                .to(float, {
                    y: -16,
                    scale: 1,
                    duration: 0.117,
                    ease: "power2.out",
                })
                .to(float, {
                    y: -52,
                    duration: 0.45,
                    ease: "power1.out",
                })
                .to(float, {
                    y: -76,
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
        <div ref={wrapperRef} className={styles.wrapper} style={wrapperStyleVars}>
            {name && <span className={styles.name}>{name}</span>}

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
                            -{activeHit.amount}
                        </span>
                    )}
                </div>
            </div>

            {(resistances.length > 0 || weaknesses.length > 0) && (
                <div className={styles.affinityContainer}>
                    {resistances.length > 0 && (
                        <AffinitySection label="Resists" elements={resistances} />
                    )}
                    {weaknesses.length > 0 && (
                        <AffinitySection label="Weak To" elements={weaknesses} />
                    )}
                </div>
            )}
        </div>
    );
}

// Single inner-frame chip showing a label ("Resists" / "Weak To") above
// a row of element rune icons. Lives inside EnemyHealthBar so the visual
// chrome stays alongside the bar it describes.
function AffinitySection({ label, elements }: { label: string; elements: readonly string[] }) {
    return (
        <div className={styles.affinitySection}>
            <span className={styles.affinityLabel}>{label}</span>
            <div className={styles.affinityIcons}>
                {elements.map(element => {
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
