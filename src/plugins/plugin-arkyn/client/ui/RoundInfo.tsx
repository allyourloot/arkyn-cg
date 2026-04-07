import { useCurrentRound } from "../arkynStore";
import styles from "./RoundInfo.module.css";

export default function RoundInfo() {
    const round = useCurrentRound();

    if (round <= 0) return null;

    return (
        <div className={styles.wrapper}>
            <span className={styles.label}>Round {round}</span>
        </div>
    );
}
