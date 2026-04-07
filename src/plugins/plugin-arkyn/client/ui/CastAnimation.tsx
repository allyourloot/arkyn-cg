import { useEffect, useState } from "react";
import { useFlyingRunes } from "../arkynStore";
import { getRuneImageUrl, getBaseRuneImageUrl } from "./runeAssets";
import styles from "./CastAnimation.module.css";

export default function CastAnimation() {
    const flyingRunes = useFlyingRunes();
    const [animated, setAnimated] = useState(false);

    // Trigger animation on next frame after mount so CSS transition fires
    useEffect(() => {
        if (flyingRunes.length > 0) {
            setAnimated(false);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setAnimated(true);
                });
            });
        } else {
            setAnimated(false);
        }
    }, [flyingRunes]);

    if (flyingRunes.length === 0) return null;

    return (
        <div className={styles.layer}>
            {flyingRunes.map((fr, i) => {
                const baseUrl = getBaseRuneImageUrl(fr.rune.rarity);
                const runeUrl = getRuneImageUrl(fr.rune.element);

                const x = animated ? fr.toX - 48 : fr.fromX - 48;
                const y = animated ? fr.toY - 48 : fr.fromY - 48;
                const scale = animated ? 0.85 : 1;

                return (
                    <div
                        key={`fly-${fr.rune.id}-${i}`}
                        className={styles.flyer}
                        style={{
                            left: x,
                            top: y,
                            transitionDelay: `${i * 60}ms`,
                            transform: `scale(${scale})`,
                        }}
                    >
                        {baseUrl && (
                            <img src={baseUrl} alt="" className={styles.runeImg} />
                        )}
                        {runeUrl && (
                            <img src={runeUrl} alt={fr.rune.element} className={styles.runeImg} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
