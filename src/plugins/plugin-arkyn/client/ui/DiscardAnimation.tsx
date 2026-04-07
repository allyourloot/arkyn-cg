import { useEffect, useState } from "react";
import { useDiscardingRunes } from "../arkynStore";
import { getRuneImageUrl, getBaseRuneImageUrl } from "./runeAssets";
import styles from "./DiscardAnimation.module.css";

export default function DiscardAnimation() {
    const discardingRunes = useDiscardingRunes();
    const [animated, setAnimated] = useState(false);

    useEffect(() => {
        if (discardingRunes.length > 0) {
            setAnimated(false);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setAnimated(true);
                });
            });
        } else {
            setAnimated(false);
        }
    }, [discardingRunes]);

    if (discardingRunes.length === 0) return null;

    return (
        <div className={styles.layer}>
            {discardingRunes.map((dr, i) => {
                const baseUrl = getBaseRuneImageUrl(dr.rune.rarity);
                const runeUrl = getRuneImageUrl(dr.rune.element);

                const x = dr.fromX - 48;
                const y = animated ? dr.fromY + 200 : dr.fromY - 48;

                return (
                    <div
                        key={`discard-${dr.rune.id}-${i}`}
                        className={styles.flyer}
                        style={{
                            left: x,
                            top: y,
                            transitionDelay: `${i * 40}ms`,
                            opacity: animated ? 0 : 1,
                            transform: animated ? "scale(0.4) rotate(15deg)" : "scale(1) rotate(0deg)",
                        }}
                    >
                        {baseUrl && (
                            <img src={baseUrl} alt="" className={styles.runeImg} />
                        )}
                        {runeUrl && (
                            <img src={runeUrl} alt={dr.rune.element} className={styles.runeImg} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
