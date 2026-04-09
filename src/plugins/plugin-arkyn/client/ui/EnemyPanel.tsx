import {
    useEnemyName,
    useEnemyElement,
    useEnemyResistances,
    useEnemyWeaknesses,
} from "../arkynStore";
import { ELEMENT_COLORS, createPanelStyleVars } from "./styles";
import { getRuneImageUrl } from "./runeAssets";
import innerFrameGoldUrl from "/assets/ui/inner-frame-gold.png?url";
import styles from "./EnemyPanel.module.css";

const panelStyleVars = createPanelStyleVars(innerFrameGoldUrl);

export default function EnemyPanel() {
    const name = useEnemyName();
    const element = useEnemyElement();
    const resistances = useEnemyResistances();
    const weaknesses = useEnemyWeaknesses();

    if (!name) return null;

    const elementColor = ELEMENT_COLORS[element] ?? "#aaa";

    return (
        <div className={styles.panel} style={panelStyleVars}>
            <span className={styles.heading}>Enemy</span>

            {/* Header section: portrait + name */}
            <div className={styles.section}>
                <div className={styles.portrait} style={{ borderColor: elementColor }}>
                    <span className={styles.portraitGlyph}>
                        {element === "earth" ? "🗿" : element === "fire" ? "🔥" : element === "ice" ? "❄️" : "👹"}
                    </span>
                </div>
                <span className={styles.name}>{name}</span>
            </div>

            {/* Resistances section */}
            {resistances.length > 0 && (
                <div className={styles.section}>
                    <span className={styles.affinityLabel}>Resists</span>
                    <div className={styles.affinityRow}>
                        {resistances.map(r => {
                            const url = getRuneImageUrl(r);
                            if (!url) return null;
                            return (
                                <img
                                    key={r}
                                    src={url}
                                    alt={r}
                                    className={styles.affinityIcon}
                                />
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Weaknesses section */}
            {weaknesses.length > 0 && (
                <div className={styles.section}>
                    <span className={styles.affinityLabel}>Weak to</span>
                    <div className={styles.affinityRow}>
                        {weaknesses.map(w => {
                            const url = getRuneImageUrl(w);
                            if (!url) return null;
                            return (
                                <img
                                    key={w}
                                    src={url}
                                    alt={w}
                                    className={styles.affinityIcon}
                                />
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
