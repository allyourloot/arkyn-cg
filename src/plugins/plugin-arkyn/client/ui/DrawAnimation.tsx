import { useEffect, useState } from "react";
import { useDrawingRunes } from "../arkynStore";
import { getRuneImageUrl, getBaseRuneImageUrl } from "./runeAssets";
import styles from "./DrawAnimation.module.css";

export default function DrawAnimation() {
    const drawingRunes = useDrawingRunes();
    const [animated, setAnimated] = useState(false);

    useEffect(() => {
        if (drawingRunes.length > 0) {
            setAnimated(false);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    setAnimated(true);
                });
            });
        } else {
            setAnimated(false);
        }
    }, [drawingRunes]);

    if (drawingRunes.length === 0) return null;

    // Get pouch position as the animation origin
    const pouchEl = document.querySelector("[data-pouch-counter]");
    const pouchRect = pouchEl?.getBoundingClientRect();
    const originX = pouchRect ? pouchRect.left + pouchRect.width / 2 : window.innerWidth - 40;
    const originY = pouchRect ? pouchRect.top + pouchRect.height / 2 : window.innerHeight - 40;

    return (
        <div className={styles.layer}>
            {drawingRunes.map((dr, i) => {
                const baseUrl = getBaseRuneImageUrl(dr.rune.rarity);
                const runeUrl = getRuneImageUrl(dr.rune.element);

                const half = dr.size / 2;
                const x = animated ? dr.toX - half : originX - half;
                const y = animated ? dr.toY - half : originY - half;
                const scale = animated ? 1 : 0.4;

                return (
                    <div
                        key={`draw-${dr.rune.id}-${i}`}
                        className={styles.flyer}
                        style={{
                            left: x,
                            top: y,
                            width: dr.size,
                            height: dr.size,
                            transitionDelay: `${i * 60}ms`,
                            transform: `scale(${scale})`,
                            opacity: animated ? 1 : 0,
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
