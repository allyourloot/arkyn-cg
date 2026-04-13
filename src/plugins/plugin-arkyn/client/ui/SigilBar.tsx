import { useRef, type CSSProperties } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { MAX_SIGILS } from "../../shared";
import { SIGIL_DEFINITIONS } from "../../shared/sigils";
import { useSigils, sendSellSigil, useActiveSigilShake, registerSigilSlot } from "../arkynStore";
import { RUNE_SHAKE_FRAME_S } from "../arkynAnimations";
import SigilScene from "./SigilScene";
import goldIconUrl from "/assets/icons/gold-64x64.png?url";
import handFrameUrl from "/assets/ui/hand-frame.png?url";
import frameUrl from "/assets/ui/frame.png?url";
import innerFrameUrl from "/assets/ui/inner-frame.png?url";
import styles from "./SigilBar.module.css";

const RARITY_BG_COLORS: Record<string, string> = {
    common: "#6b6b6b",
    uncommon: "#309f30",
    rare: "#3b7dd8",
    legendary: "#d4a017",
};

const slotFrameVars = {
    "--slot-bg": `url(${handFrameUrl})`,
    "--tooltip-bg": `url(${frameUrl})`,
    "--tooltip-desc-bg": `url(${innerFrameUrl})`,
} as CSSProperties;

/** Parse `{text}` markers in a description string into green-highlighted spans. */
function renderDescription(desc: string) {
    const parts = desc.split(/(\{[^}]+\})/g);
    return parts.map((part, i) => {
        if (part.startsWith("{") && part.endsWith("}")) {
            return <span key={i} style={{ color: "#309f30" }}>{part.slice(1, -1)}</span>;
        }
        return part;
    });
}

const HOVER_POP_SCALE = 1.1;

const HAS_HOVER =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: hover)").matches;

export default function SigilBar() {
    const sigils = useSigils();
    const activeSigilShake = useActiveSigilShake();
    const barRef = useRef<HTMLDivElement>(null);
    const slotRefs = useRef<(HTMLDivElement | null)[]>([]);

    // Sigil shake animation — fires when activeSigilShake changes
    useGSAP(() => {
        if (!activeSigilShake) return;
        const { sigilId } = activeSigilShake;
        const slotIndex = sigils.indexOf(sigilId);
        if (slotIndex < 0) return;
        const el = slotRefs.current[slotIndex];
        if (!el) return;

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
    }, { dependencies: [activeSigilShake], scope: barRef });

    // Hover pop handlers
    const handlePointerEnter = (i: number) => {
        const el = slotRefs.current[i];
        if (!el) return;
        gsap.to(el, { scale: HOVER_POP_SCALE, duration: 0.08, ease: "power4.out", overwrite: "auto" });
    };
    const handlePointerLeave = (i: number) => {
        const el = slotRefs.current[i];
        if (!el) return;
        gsap.to(el, { scale: 1, duration: 0.12, ease: "power3.out", overwrite: "auto" });
    };

    return (
        <div ref={barRef} className={styles.wrapper}>
            {Array.from({ length: MAX_SIGILS }, (_, i) => {
                const sigilId = sigils[i];

                if (!sigilId) {
                    return (
                        <div
                            key={i}
                            ref={(el) => { registerSigilSlot(i, el); }}
                            className={styles.slot}
                            style={slotFrameVars}
                        />
                    );
                }

                const def = SIGIL_DEFINITIONS[sigilId];
                if (!def) return <div key={i} className={styles.slot} style={slotFrameVars} />;

                const rarityBg = RARITY_BG_COLORS[def.rarity] ?? "#6b6b6b";

                return (
                    <div
                        key={sigilId}
                        ref={(el) => { slotRefs.current[i] = el; registerSigilSlot(i, el); }}
                        className={styles.filledSlot}
                        style={slotFrameVars}
                        onPointerEnter={HAS_HOVER ? () => handlePointerEnter(i) : undefined}
                        onPointerLeave={HAS_HOVER ? () => handlePointerLeave(i) : undefined}
                    >
                        <SigilScene sigilId={sigilId} index={i} />
                        {/* Tooltip — centered below */}
                        <div className={styles.tooltip}>
                            <span className={styles.tooltipName}>
                                {def.name}
                            </span>
                            <div className={styles.tooltipDescWrap}>
                                <span className={styles.tooltipDesc}>
                                    {renderDescription(def.description)}
                                </span>
                            </div>
                            <span
                                className={styles.tooltipRarity}
                                style={{ backgroundColor: rarityBg }}
                            >
                                {def.rarity}
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
            <span className={styles.countLabel}>{sigils.length}/{MAX_SIGILS}</span>
        </div>
    );
}
