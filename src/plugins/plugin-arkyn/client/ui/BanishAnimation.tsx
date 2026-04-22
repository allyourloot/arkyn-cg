import { DISSOLVE_DURATION_MS, useBanishingRunes, useBanishStartTime } from "../arkynAnimations";
import DissolveCanvas from "./DissolveCanvas";
import { getBaseRuneImageUrl, getRuneImageUrl } from "./runeAssets";
import styles from "./DiscardAnimation.module.css";

/**
 * Flyer layer for the Banish sigil's "first solo discard destroys the
 * rune" effect. Reuses DiscardAnimation's module CSS (absolute flyer
 * inside a fixed full-viewport layer) so Banish shares the same z-stack
 * as the standard discard flyer — no chance of one being covered by the
 * other since they never run concurrently (`isAnimating()` gates).
 *
 * The rune dissolves in place at its captured hand-slot position via the
 * shared DissolveCanvas. Positioning is absolute-to-viewport so the
 * flyer stays anchored even when HandDisplay re-layouts the shrinking
 * hand underneath it.
 */
export default function BanishAnimation() {
    const banishingRunes = useBanishingRunes();
    const startTime = useBanishStartTime();

    if (banishingRunes.length === 0) return null;

    return (
        <div className={styles.layer}>
            {banishingRunes.map((dr, i) => {
                const half = dr.size / 2;
                return (
                    <div
                        key={`banish-${dr.rune.id}-${i}`}
                        className={styles.flyer}
                        style={{
                            left: dr.fromX - half,
                            top: dr.fromY - half,
                            width: dr.size,
                            height: dr.size,
                        }}
                    >
                        <DissolveCanvas
                            element={dr.rune.element}
                            rune={{
                                baseUrl: getBaseRuneImageUrl(dr.rune.rarity),
                                runeUrl: getRuneImageUrl(dr.rune.element),
                            }}
                            startTime={startTime}
                            duration={DISSOLVE_DURATION_MS}
                            size={dr.size}
                        />
                    </div>
                );
            })}
        </div>
    );
}
