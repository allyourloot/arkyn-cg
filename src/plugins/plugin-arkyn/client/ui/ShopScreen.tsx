import type { CSSProperties } from "react";
import { sendReady } from "../arkynStore";
import { playMenuOpen } from "../sfx";
import { createPanelStyleVars } from "./styles";
import BouncyText from "./BouncyText";
import buttonGreenUrl from "/assets/ui/button-green.png?url";
import buttonGreenHoverUrl from "/assets/ui/button-green-hover.png?url";
import buttonGreenDisabledUrl from "/assets/ui/button-green-disabled.png?url";
import styles from "./ShopScreen.module.css";

const panelStyleVars = createPanelStyleVars();
const buttonStyleVars = {
    "--btn-bg": `url(${buttonGreenUrl})`,
    "--btn-bg-hover": `url(${buttonGreenHoverUrl})`,
    "--btn-bg-disabled": `url(${buttonGreenDisabledUrl})`,
} as CSSProperties;

/**
 * Center-column shop area. Foundation-only: a large 9-slice frame with
 * a placeholder body and a Continue button that advances to the next
 * round via sendReady() (the server's handleReady routes shop -> playing).
 *
 * Future shop items will live inside the .body region.
 */
type ShopScreenProps = {
    ref?: React.Ref<HTMLDivElement>;
};

export default function ShopScreen({ ref }: ShopScreenProps = {}) {
    const handleContinue = () => {
        playMenuOpen();
        sendReady();
    };

    return (
        <div ref={ref} className={styles.panel} style={panelStyleVars}>
            <span className={styles.title}>Shop</span>

            <div className={styles.contentFrame}>
                <BouncyText className={styles.placeholder}>
                    The shopkeeper's wares will appear here soon.
                </BouncyText>
            </div>

            <button
                type="button"
                onClick={handleContinue}
                className={styles.button}
                style={buttonStyleVars}
            >
                Next Round
            </button>
        </div>
    );
}
