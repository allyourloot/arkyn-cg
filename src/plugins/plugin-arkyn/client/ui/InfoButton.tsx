import { useState } from "react";
import InfoModal from "./InfoModal";
import { createPanelStyleVars } from "./styles";
import styles from "./InfoButton.module.css";

const panelStyleVars = createPanelStyleVars();

export default function InfoButton() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                className={styles.button}
                style={panelStyleVars}
                onClick={() => setIsOpen(true)}
                aria-label="Open game info"
            >
                <span className={styles.icon}>?</span>
            </button>
            {isOpen && <InfoModal onClose={() => setIsOpen(false)} />}
        </>
    );
}
