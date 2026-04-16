import { useEffect, useRef, useState, type CSSProperties } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { MAX_SIGILS } from "../../shared";
import { SIGIL_DEFINITIONS } from "../../shared/sigils";
import { useSigils, sendSellSigil, useActiveSigilShake, registerSigilSlot } from "../arkynStore";
import { RUNE_SHAKE_FRAME_S } from "../arkynAnimations";
import ItemScene from "./ItemScene";
import Tooltip from "./Tooltip";
import goldIconUrl from "/assets/icons/gold-64x64.png?url";
import handFrameUrl from "/assets/ui/hand-frame.png?url";
import innerFrameUrl from "/assets/ui/inner-frame.png?url";
import { HAS_HOVER } from "./utils/hasHover";
import { renderDescription, SigilExplainer } from "./descriptionText";
import ConsumableBar from "./ConsumableBar";
import styles from "./SigilBar.module.css";

const RARITY_BG_COLORS: Record<string, string> = {
    common: "#6b6b6b",
    uncommon: "#309f30",
    rare: "#c13030",
    legendary: "#d4a017",
};

const slotFrameVars = {
    "--slot-bg": `url(${handFrameUrl})`,
    "--tooltip-desc-bg": `url(${innerFrameUrl})`,
} as CSSProperties;

// Hover: subtle scale pop. Active (selected): raise the slot upward.
const HOVER_POP_SCALE = 1.05;
const ACTIVE_LIFT_PX = -12;
const ACTIVE_SCALE = 1.04;
const ACTIVE_EASE = "back.out(1.9)";
const ACTIVE_DURATION_S = 0.22;
const HOVER_EASE = "power3.out";
const HOVER_DURATION_S = 0.12;

export default function SigilBar() {
    const sigils = useSigils();
    const activeSigilShake = useActiveSigilShake();
    const barRef = useRef<HTMLDivElement>(null);
    const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
    const [selectedSigilId, setSelectedSigilId] = useState<string | null>(null);
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

    // Deselect when the user clicks outside the sigil bar. The slot's own
    // onClick toggles selection, so in-bar clicks are handled by React state
    // updates and this listener only fires for genuinely-outside clicks.
    useEffect(() => {
        if (!selectedSigilId) return;
        const handleDocClick = (e: MouseEvent) => {
            if (barRef.current && !barRef.current.contains(e.target as Node)) {
                setSelectedSigilId(null);
            }
        };
        document.addEventListener("click", handleDocClick);
        return () => document.removeEventListener("click", handleDocClick);
    }, [selectedSigilId]);

    // If the selected sigil is sold (e.g. via server echo) or removed, clear
    // the selection so a stale sell button doesn't linger.
    useEffect(() => {
        if (selectedSigilId && !sigils.includes(selectedSigilId)) {
            setSelectedSigilId(null);
        }
    }, [sigils, selectedSigilId]);

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

    // Combined hover + selection animation — single source of truth for each
    // slot's transform so the two states don't fight. Selection wins over
    // hover (selected slot stays lifted regardless of hover state).
    useGSAP(() => {
        const selectedIdx = selectedSigilId ? sigils.indexOf(selectedSigilId) : -1;
        for (let i = 0; i < slotRefs.current.length; i++) {
            const el = slotRefs.current[i];
            if (!el) continue;
            const isSelected = i === selectedIdx;
            const isHovered = i === hoveredIdx;
            const targetY = isSelected ? ACTIVE_LIFT_PX : 0;
            const targetScale = isSelected
                ? ACTIVE_SCALE
                : isHovered ? HOVER_POP_SCALE : 1;
            gsap.to(el, {
                y: targetY,
                scale: targetScale,
                duration: isSelected ? ACTIVE_DURATION_S : HOVER_DURATION_S,
                ease: isSelected ? ACTIVE_EASE : HOVER_EASE,
                overwrite: "auto",
            });
        }
    }, { dependencies: [selectedSigilId, hoveredIdx, sigils], scope: barRef });

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

                const isSelected = selectedSigilId === sigilId;

                return (
                    <div
                        key={sigilId}
                        ref={(el) => { slotRefs.current[i] = el; registerSigilSlot(i, el); }}
                        className={`${styles.filledSlot} ${isSelected ? styles.filledSlotSelected : ""}`}
                        style={slotFrameVars}
                        onPointerEnter={HAS_HOVER ? () => setHoveredIdx(i) : undefined}
                        onPointerLeave={HAS_HOVER ? () => setHoveredIdx(prev => prev === i ? null : prev) : undefined}
                        onClick={() => setSelectedSigilId(prev => prev === sigilId ? null : sigilId)}
                    >
                        <ItemScene itemId={sigilId} index={i} />
                        {/* Tooltip — centered below, hover-only (info) */}
                        <Tooltip placement="bottom" arrow variant="framed">
                            <span className={styles.tooltipName}>
                                {def.name}
                            </span>
                            <div className={styles.tooltipDescWrap}>
                                <span className={styles.tooltipDesc}>
                                    {renderDescription(def.description)}
                                </span>
                                {def.explainer && (
                                    <SigilExplainer
                                        label={def.explainer.label}
                                        elements={def.explainer.elements}
                                    />
                                )}
                            </div>
                            <span
                                className={styles.tooltipRarity}
                                style={{ backgroundColor: rarityBg }}
                            >
                                {def.rarity}
                            </span>
                        </Tooltip>
                        {/* Sell button — click-to-reveal, stays until dismissed */}
                        {isSelected && (
                            <button
                                type="button"
                                className={styles.sellButton}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    sendSellSigil(sigilId);
                                    setSelectedSigilId(null);
                                }}
                            >
                                <span>Sell</span>
                                <span className={styles.sellValue}>
                                    <img src={goldIconUrl} alt="Gold" className={styles.sellIcon} />
                                    {def.sellPrice}
                                </span>
                            </button>
                        )}
                    </div>
                );
            })}
            <span className={styles.countLabel}>{sigils.length}/{MAX_SIGILS}</span>
            <ConsumableBar />
        </div>
    );
}
