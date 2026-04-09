import { getBaseRuneImageUrl, getRuneImageUrl } from "./runeAssets";

interface RuneImageProps {
    rarity: string;
    element: string;
    /**
     * Class applied to BOTH the base rarity layer and the rune element
     * layer. Each consumer's CSS module owns the sizing/positioning rules;
     * this component just renders the two stacked images.
     */
    className: string;
}

/**
 * The standard "rune art" rendering: a rarity-base image with the rune's
 * element glyph stacked on top. Used everywhere a rune is shown — hand
 * cards, pouch modal, fly/discard/draw animations.
 */
export default function RuneImage({ rarity, element, className }: RuneImageProps) {
    const baseUrl = getBaseRuneImageUrl(rarity);
    const runeUrl = getRuneImageUrl(element);
    return (
        <>
            {baseUrl && (
                <img src={baseUrl} alt="" className={className} draggable={false} />
            )}
            {runeUrl && (
                <img src={runeUrl} alt={element} className={className} draggable={false} />
            )}
        </>
    );
}
