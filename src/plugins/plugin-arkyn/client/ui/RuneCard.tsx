import type { RuneClientData } from "../arkynStore";
import { getRuneImageUrl, getBaseRuneImageUrl } from "./runeAssets";
import styles from "./RuneCard.module.css";

interface RuneCardProps {
    rune: RuneClientData;
    isSelected: boolean;
    index: number;
    onClick: () => void;
    rotation?: number;
}

export default function RuneCard({ rune, isSelected, onClick, rotation = 0 }: RuneCardProps) {
    const runeUrl = getRuneImageUrl(rune.element);
    const baseUrl = getBaseRuneImageUrl(rune.rarity);

    return (
        <div
            onClick={onClick}
            className={`${styles.card} ${isSelected ? styles.selected : ""}`}
            style={{
                transform: `translateY(${isSelected ? -24 : 0}px) rotate(${rotation}deg)`,
            }}
        >
            {/* Base rarity image (bottom layer) */}
            {baseUrl && (
                <img src={baseUrl} alt="" className={styles.layer} draggable={false} />
            )}
            {/* Rune type icon (top layer) */}
            {runeUrl && (
                <img src={runeUrl} alt={rune.element} className={styles.layer} draggable={false} />
            )}
        </div>
    );
}
