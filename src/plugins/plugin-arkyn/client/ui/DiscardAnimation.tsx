import { useDiscardingRunes } from "../arkynStore";
import { useFlyTrigger } from "./hooks/useFlyTrigger";
import RuneImage from "./RuneImage";
import styles from "./DiscardAnimation.module.css";

export default function DiscardAnimation() {
    const discardingRunes = useDiscardingRunes();
    const animated = useFlyTrigger(discardingRunes);

    if (discardingRunes.length === 0) return null;

    return (
        <div className={styles.layer}>
            {discardingRunes.map((dr, i) => {
                const half = dr.size / 2;
                const x = dr.fromX - half;
                const y = animated ? dr.fromY + 200 : dr.fromY - half;

                return (
                    <div
                        key={`discard-${dr.rune.id}-${i}`}
                        className={styles.flyer}
                        style={{
                            left: x,
                            top: y,
                            width: dr.size,
                            height: dr.size,
                            transitionDelay: `${i * 40}ms`,
                            opacity: animated ? 0 : 1,
                            transform: animated ? "scale(0.4) rotate(15deg)" : "scale(1) rotate(0deg)",
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
