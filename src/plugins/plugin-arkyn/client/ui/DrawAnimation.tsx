import { useDrawingRunes } from "../arkynStore";
import { useFlyTrigger } from "./hooks/useFlyTrigger";
import RuneImage from "./RuneImage";
import styles from "./DrawAnimation.module.css";

export default function DrawAnimation() {
    const drawingRunes = useDrawingRunes();
    const animated = useFlyTrigger(drawingRunes);

    if (drawingRunes.length === 0) return null;

    // Get pouch position as the animation origin
    const pouchEl = document.querySelector("[data-pouch-counter]");
    const pouchRect = pouchEl?.getBoundingClientRect();
    const originX = pouchRect ? pouchRect.left + pouchRect.width / 2 : window.innerWidth - 40;
    const originY = pouchRect ? pouchRect.top + pouchRect.height / 2 : window.innerHeight - 40;

    return (
        <div className={styles.layer}>
            {drawingRunes.map((dr, i) => {
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
                        <RuneImage
                            rarity={dr.rune.rarity}
                            element={dr.rune.element}
                            className={styles.runeImg}
                        />
                    </div>
                );
            })}
        </div>
    );
}
