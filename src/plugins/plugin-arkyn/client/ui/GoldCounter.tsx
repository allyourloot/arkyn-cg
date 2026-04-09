import { useGold } from "../arkynStore";
import goldIconUrl from "/assets/icons/gold-64x64.png?url";
import styles from "./GoldCounter.module.css";

/**
 * Persistent currency HUD. Lives at the bottom of the SpellPreview
 * panel inside its own inner-frame chrome (the parent panel supplies
 * `--section-bg` via createPanelStyleVars). Uses warm gold Sburbits
 * styling to match `RoundInfo` / `PouchCounter`.
 */
export default function GoldCounter() {
    const gold = useGold();

    return (
        <div className={styles.wrapper}>
            <img src={goldIconUrl} alt="Gold" className={styles.icon} />
            <span className={styles.count}>{gold}</span>
        </div>
    );
}
