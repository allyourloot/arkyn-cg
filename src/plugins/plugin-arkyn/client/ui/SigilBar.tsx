import { useRef, type CSSProperties } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { MAX_SIGILS } from "../../shared";
import { SIGIL_DEFINITIONS } from "../../shared/sigils";
import { useSigils, sendSellSigil, useActiveSigilShake } from "../arkynStore";
import { RUNE_SHAKE_FRAME_S } from "../arkynAnimations";
import { getSigilImageUrl } from "./sigilAssets";
import goldIconUrl from "/assets/icons/gold-64x64.png?url";
import innerFrameUrl from "/assets/ui/inner-frame.png?url";
import styles from "./SigilBar.module.css";

const RARITY_COLORS: Record<string, string> = {
    common: "#b0b0b0",
    uncommon: "#4ade80",
    rare: "#60a5fa",
    legendary: "#fbbf24",
};

const frameStyleVars = {
    "--sigil-frame-bg": `url(${innerFrameUrl})`,
} as CSSProperties;

export default function SigilBar() {
    const sigils = useSigils();
    const activeSigilShake = useActiveSigilShake();
    const barRef = useRef<HTMLDivElement>(null);
    const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
    const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);

    // Sigil shake animation — fires when activeSigilShake changes
    useGSAP(() => {
        if (!activeSigilShake) return;
        const { sigilId } = activeSigilShake;
        // Find which slot has this sigil
        const slotIndex = sigils.indexOf(sigilId);
        if (slotIndex < 0) return;
        const el = slotRefs.current[slotIndex];
        const labelEl = labelRefs.current[slotIndex];
        if (!el) return;

        // Shake the sigil icon (same style as rune shake)
        gsap.set(el, { x: 0, y: 0, rotation: 0, scale: 1 });
        gsap.to(el, {
            keyframes: [
                { x: -2, y: -1, rotation: -2, scale: 1.08, duration: RUNE_SHAKE_FRAME_S },
                { x: 2, y: 1, rotation: 2, scale: 1.12, duration: RUNE_SHAKE_FRAME_S },
                { x: -1.5, y: 0, rotation: -1, scale: 1.06, duration: RUNE_SHAKE_FRAME_S },
                { x: 1, y: 0, rotation: 0.5, scale: 1.03, duration: RUNE_SHAKE_FRAME_S },
                { x: 0, y: 0, rotation: 0, scale: 1, duration: RUNE_SHAKE_FRAME_S },
            ],
            ease: "power2.out",
            overwrite: "auto",
        });

        // Proc label: pop in below the sigil, then drift down + fade out
        if (labelEl) {
            gsap.killTweensOf(labelEl);
            const tl = gsap.timeline();
            tl.set(labelEl, { opacity: 0, y: 0, scale: 0.7 });
            tl.to(labelEl, {
                opacity: 1,
                y: 2,
                scale: 1,
                duration: 0.12,
                ease: "back.out(2)",
            });
            tl.to(labelEl, {
                opacity: 0,
                y: 14,
                duration: 0.45,
                ease: "power1.out",
            }, "+=0.2");
        }
    }, { dependencies: [activeSigilShake], scope: barRef });

    return (
        <div ref={barRef} className={styles.wrapper}>
            <div className={styles.frame} style={frameStyleVars}>
                {Array.from({ length: MAX_SIGILS }, (_, i) => {
                    const sigilId = sigils[i];
                    if (!sigilId) {
                        return <div key={i} className={styles.emptySlot} />;
                    }

                    const def = SIGIL_DEFINITIONS[sigilId];
                    if (!def) return <div key={i} className={styles.emptySlot} />;

                    const imageUrl = getSigilImageUrl(sigilId, 64);
                    const rarityColor = RARITY_COLORS[def.rarity] ?? "#b0b0b0";

                    return (
                        <div
                            key={sigilId}
                            ref={(el) => { slotRefs.current[i] = el; }}
                            className={styles.filledSlot}
                        >
                            {imageUrl && (
                                <img
                                    src={imageUrl}
                                    alt={def.name}
                                    className={styles.sigilImage}
                                    draggable={false}
                                />
                            )}
                            {/* Proc label — animated by GSAP on proc */}
                            <span
                                ref={(el) => { labelRefs.current[i] = el; }}
                                className={styles.procLabel}
                                style={{ opacity: 0 }}
                            >
                                {def.name}
                            </span>
                            {/* Tooltip on hover */}
                            <div className={styles.tooltip}>
                                <span
                                    className={styles.tooltipName}
                                    style={{ color: rarityColor }}
                                >
                                    {def.name}
                                </span>
                                <span
                                    className={styles.tooltipRarity}
                                    style={{ color: rarityColor }}
                                >
                                    {def.rarity}
                                </span>
                                <span className={styles.tooltipDesc}>
                                    {def.description}
                                </span>
                                <button
                                    type="button"
                                    className={styles.sellButton}
                                    onClick={() => sendSellSigil(sigilId)}
                                >
                                    Sell
                                    <img src={goldIconUrl} alt="Gold" className={styles.sellIcon} />
                                    {def.sellPrice}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
            <span className={styles.countLabel}>{sigils.length}/{MAX_SIGILS}</span>
        </div>
    );
}
