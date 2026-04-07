import { usePlayedRunes } from "../arkynStore";
import { MAX_PLAY } from "../../shared";
import { getRuneImageUrl, getBaseRuneImageUrl } from "./runeAssets";
import styles from "./PlayArea.module.css";

export default function PlayArea() {
    const playedRunes = usePlayedRunes();

    return (
        <div className={styles.area}>
            {Array.from({ length: MAX_PLAY }, (_, i) => {
                const rune = playedRunes[i];
                const baseUrl = rune ? getBaseRuneImageUrl(rune.rarity) : "";
                const runeUrl = rune ? getRuneImageUrl(rune.element) : "";

                return (
                    <div
                        key={i}
                        data-slot-index={i}
                        className={`${styles.slot} ${rune ? "" : styles.empty}`}
                    >
                        {rune ? (
                            <>
                                {baseUrl && (
                                    <img src={baseUrl} alt="" className={styles.layer} />
                                )}
                                {runeUrl && (
                                    <img src={runeUrl} alt={rune.element} className={styles.layer} />
                                )}
                            </>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}
