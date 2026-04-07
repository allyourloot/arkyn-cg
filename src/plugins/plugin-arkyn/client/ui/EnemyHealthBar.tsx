import { useEnemyHp, useEnemyMaxHp, useEnemyName } from "../arkynStore";
import styles from "./EnemyHealthBar.module.css";

export default function EnemyHealthBar() {
    const hp = useEnemyHp();
    const maxHp = useEnemyMaxHp();
    const name = useEnemyName();

    if (maxHp <= 0) return null;

    const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));

    // Color transitions based on HP percentage
    let barColor = "#22c55e"; // green
    if (pct < 60) barColor = "#eab308"; // yellow
    if (pct < 35) barColor = "#f97316"; // orange
    if (pct < 15) barColor = "#ef4444"; // red

    return (
        <div className={styles.wrapper}>
            <span className={styles.name}>{name}</span>
            <div className={styles.barOuter}>
                <div
                    className={styles.barFill}
                    style={{ width: `${pct}%`, backgroundColor: barColor }}
                />
                <span className={styles.barText}>
                    {hp} / {maxHp}
                </span>
            </div>
        </div>
    );
}
