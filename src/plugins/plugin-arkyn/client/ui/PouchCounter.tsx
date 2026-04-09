import { useState } from "react";
import { usePouchSize } from "../arkynStore";
import { getBaseRuneImageUrl } from "./runeAssets";
import PouchModal from "./PouchModal";
import styles from "./PouchCounter.module.css";

export default function PouchCounter() {
    const pouchSize = usePouchSize();
    const baseUrl = getBaseRuneImageUrl("common");
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                data-pouch-counter
                className={styles.wrapper}
                onClick={() => setIsOpen(true)}
                aria-label="Open pouch"
            >
                {baseUrl && (
                    <img src={baseUrl} alt="Pouch" className={styles.icon} />
                )}
                <span className={styles.count}>{pouchSize}</span>
            </button>
            {isOpen && <PouchModal onClose={() => setIsOpen(false)} />}
        </>
    );
}
