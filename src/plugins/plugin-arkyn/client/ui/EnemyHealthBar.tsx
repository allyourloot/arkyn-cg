import { useEffect, useRef, useState, type CSSProperties } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
    useDisplayedEnemyHp,
    useEnemyMaxHp,
    useEnemyDamageHit,
    BAR_SHAKE_FRAME_S,
} from "../arkynStore";
import { ELEMENT_COLORS, createPanelStyleVars } from "./styles";
import { playCritical } from "../sfx";
import criticalUrl from "/assets/ui/critical.png?url";
import executeUrl from "/assets/ui/execute.png?url";
import styles from "./EnemyHealthBar.module.css";

// `--panel-bg` (frame.png) drives the bar's 9-slice chrome.
const baseStyleVars = createPanelStyleVars() as CSSProperties;

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

// Slim HP bar (fill + stripes + drain animation + shake + floating
// damage number) mounted in the center column above the play area, so
// the cast → damage payoff feels visually contiguous with the rune
// dissolves and total damage count-up. Enemy identity (name, boss tag,
// resists/weaknesses) lives in the floating right-side EnemyInfoPanel.
export default function EnemyHealthBar({ ref: externalRef }: EnemyHealthBarProps = {}) {
    // The bar reads the "displayed" HP, which lags behind the server's
    // authoritative `enemyHp` during a cast animation so the damage
    // drops in sync with the dissolve finale (not when the cast is sent).
    const hp = useDisplayedEnemyHp();
    const maxHp = useEnemyMaxHp();
    const enemyDamageHit = useEnemyDamageHit();

    // wrapperRef scopes the GSAP context for cleanup; the actual shake
    // target is the inner barShakeRef.
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
            // Float drifts up-and-RIGHT (away from the play area below)
            // now that the bar lives in the center column. Anchored at the
            // bar's right edge via .damageFloat's `right: -10%`.
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
        <div ref={setWrapperRef} className={styles.barWrapper} style={baseStyleVars}>
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
                            className={`${styles.damageFloat} ${activeHit.isExecute ? styles.damageFloatExecute : ""}`}
                            style={damageFloatStyle}
                        >
                            {(activeHit.isExecute || activeHit.isCritical) && (
                                <img
                                    src={activeHit.isExecute ? executeUrl : criticalUrl}
                                    alt=""
                                    className={`${styles.criticalBg} ${activeHit.isExecute ? styles.criticalBgExecute : ""}`}
                                />
                            )}
                            {activeHit.isExecute ? "EXECUTED!" : `-${activeHit.amount}`}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
