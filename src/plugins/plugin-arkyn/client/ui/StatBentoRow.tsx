import { memo, type RefObject } from "react";
import BouncyText from "./BouncyText";
import GoldCounter from "./GoldCounter";
import styles from "./StatBentoRow.module.css";

interface StatBentoRowProps {
    castsValue: number | string;
    discardsValue: number | string;
    /**
     * Optional ref for the Casts chip. ShopPanel attaches this to drive
     * a GSAP "+1" scale flash when a Caster sigil is purchased. SpellPreview
     * doesn't need it (its value is driven by the live remaining counter).
     */
    castsChipRef?: RefObject<HTMLDivElement | null>;
}

function StatBentoRow({ castsValue, discardsValue, castsChipRef }: StatBentoRowProps) {
    return (
        <div className={styles.bottomSection}>
            <div className={styles.goldCell}>
                <span className={styles.statLabel}>Bank</span>
                <GoldCounter />
            </div>
            <div className={styles.statsSection}>
                <div className={styles.statColumn}>
                    <span className={styles.statLabel}>Casts</span>
                    <div
                        ref={castsChipRef}
                        className={`${styles.statChip} ${styles.statChipHands}`}
                    >
                        <BouncyText className={styles.statChipValue}>
                            {castsValue}
                        </BouncyText>
                    </div>
                </div>
                <div className={styles.statColumn}>
                    <span className={styles.statLabel}>Discards</span>
                    <div className={`${styles.statChip} ${styles.statChipDiscards}`}>
                        <BouncyText className={styles.statChipValue}>
                            {discardsValue}
                        </BouncyText>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default memo(StatBentoRow);
