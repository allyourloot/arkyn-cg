import { usePouchSize } from "../arkynStore";
import { getBaseRuneImageUrl } from "./runeAssets";
import styles from "./PouchCounter.module.css";

export default function PouchCounter() {
    const pouchSize = usePouchSize();
    const baseUrl = getBaseRuneImageUrl("common");

    return (
        <div data-pouch-counter className={styles.wrapper}>
            {baseUrl && (
                <img src={baseUrl} alt="Pouch" className={styles.icon} />
            )}
            <span className={styles.count}>{pouchSize}</span>
        </div>
    );
}
