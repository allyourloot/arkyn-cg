import { useFlyingRunes } from "../arkynStore";
import { useFlyTrigger } from "./hooks/useFlyTrigger";
import RuneImage from "./RuneImage";
import styles from "./CastAnimation.module.css";

export default function CastAnimation() {
    const flyingRunes = useFlyingRunes();
    const animated = useFlyTrigger(flyingRunes);

    if (flyingRunes.length === 0) return null;

    return (
        <div className={styles.layer}>
            {flyingRunes.map((fr, i) => {
                const half = fr.size / 2;
                const x = animated ? fr.toX - half : fr.fromX - half;
                const y = animated ? fr.toY - half : fr.fromY - half;

                return (
                    <div
                        key={`fly-${fr.rune.id}-${i}`}
                        className={styles.flyer}
                        style={{
                            left: x,
                            top: y,
                            width: fr.size,
                            height: fr.size,
                            transitionDelay: `${i * 60}ms`,
                        }}
                    >
                        <RuneImage
                            rarity={fr.rune.rarity}
                            element={fr.rune.element}
                            className={styles.runeImg}
                        />
                    </div>
                );
            })}
        </div>
    );
}
