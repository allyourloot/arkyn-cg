import { useGold } from "../arkynStore";
import goldIconUrl from "/assets/icons/gold-64x64.png?url";
import styles from "./GoldCounter.module.css";

/**
 * Persistent currency HUD. Mirrors the styling language of `RoundInfo`
 * and `PouchCounter` (Sburbits + warm gold tones, pixel-art icon),
 * pinned top-right of the overlay.
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
