import { useEffect, useState, type CSSProperties } from "react";
import {
    useDisplayedEnemyHp,
    useEnemyMaxHp,
    useEnemyDamageHit,
    ENEMY_DAMAGE_HIT_MS,
} from "../arkynStore";
import { ELEMENT_COLORS, createPanelStyleVars } from "./styles";
import styles from "./EnemyHealthBar.module.css";

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

    // Local active hit drives both the floating damage number and the
    // bar-shake CSS class. Re-keys on `seq` so identical back-to-back casts
    // still re-trigger the animation.
    const [activeHit, setActiveHit] = useState<ActiveHit | null>(null);

    useEffect(() => {
        if (enemyDamageHit.seq === 0) return;
        setActiveHit({
            amount: enemyDamageHit.amount,
            spellElement: enemyDamageHit.spellElement,
            seq: enemyDamageHit.seq,
        });
        const id = window.setTimeout(() => setActiveHit(null), ENEMY_DAMAGE_HIT_MS);
        return () => window.clearTimeout(id);
    }, [enemyDamageHit.seq, enemyDamageHit.amount, enemyDamageHit.spellElement]);

    if (maxHp <= 0) return null;

    const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));

    // Color transitions based on HP percentage
    let barColor = "#22c55e"; // green
    if (pct < 60) barColor = "#eab308"; // yellow
    if (pct < 35) barColor = "#f97316"; // orange
    if (pct < 15) barColor = "#ef4444"; // red

    const wrapperClassName = activeHit
        ? `${styles.wrapper} ${styles.shaking}`
        : styles.wrapper;

    // Outline color follows the spell that produced the hit so the floating
    // number reads as part of the same impact as the per-rune bubbles.
    const damageStrokeColor = activeHit
        ? ELEMENT_COLORS[activeHit.spellElement] ?? "#ffffff"
        : "#ffffff";
    const damageFloatStyle = { "--stroke-color": damageStrokeColor } as CSSProperties;

    return (
        <div className={wrapperClassName} style={wrapperStyleVars}>
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
                        key={activeHit.seq}
                        className={styles.damageFloat}
                        style={damageFloatStyle}
                    >
                        -{activeHit.amount}
                    </span>
                )}
            </div>
        </div>
    );
}
