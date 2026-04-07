import {
    useEnemyName,
    useEnemyElement,
    useEnemyResistances,
    useEnemyWeaknesses,
} from "../arkynStore";
import { ELEMENT_COLORS } from "./styles";
import { getRuneImageUrl } from "./runeAssets";
import styles from "./EnemyPanel.module.css";

export default function EnemyPanel() {
    const name = useEnemyName();
    const element = useEnemyElement();
    const resistances = useEnemyResistances();
    const weaknesses = useEnemyWeaknesses();

    if (!name) return null;

    const elementColor = ELEMENT_COLORS[element] ?? "#aaa";

    return (
        <div className={styles.panel}>
            <span className={styles.heading}>Enemy</span>

            {/* Enemy portrait placeholder */}
            <div className={styles.portrait} style={{ borderColor: elementColor }}>
                <span className={styles.portraitGlyph}>
                    {element === "earth" ? "🗿" : element === "fire" ? "🔥" : element === "ice" ? "❄️" : "👹"}
                </span>
            </div>

            {/* Enemy name */}
            <span className={styles.name}>{name}</span>

            {/* Element type */}
            <span
                className={styles.elementBadge}
                style={{ color: elementColor, borderColor: elementColor }}
            >
                {element}
            </span>

            {/* Resistances */}
            {resistances.length > 0 && (
                <div className={styles.affinityBlock}>
                    <span className={styles.affinityLabel}>Resists</span>
                    <div className={styles.affinityRow}>
                        {resistances.map(r => {
                            const color = ELEMENT_COLORS[r] ?? "#aaa";
                            const url = getRuneImageUrl(r);
                            return (
                                <div
                                    key={r}
                                    className={styles.affinityChip}
                                    style={{ borderColor: color }}
                                >
                                    {url && <img src={url} alt={r} className={styles.affinityIcon} />}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Weaknesses */}
            {weaknesses.length > 0 && (
                <div className={styles.affinityBlock}>
                    <span className={styles.affinityLabel}>Weak to</span>
                    <div className={styles.affinityRow}>
                        {weaknesses.map(w => {
                            const color = ELEMENT_COLORS[w] ?? "#aaa";
                            const url = getRuneImageUrl(w);
                            return (
                                <div
                                    key={w}
                                    className={styles.affinityChip}
                                    style={{ borderColor: color }}
                                >
                                    {url && <img src={url} alt={w} className={styles.affinityIcon} />}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
