import { useEffect, useRef, useState, type CSSProperties } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { MAX_SIGILS, MIMIC_INCOMPATIBLE, SIGIL_ACCUMULATOR_XMULT, SIGIL_INVENTORY_MULT } from "../../shared";
import { SIGIL_DEFINITIONS } from "../../shared/sigils";
import { useSigils, useSigilAccumulators, sendSellSigil, useActiveSigilShake, registerSigilSlot, usePendingSigilId, useSigilProcBubble } from "../arkynStore";
import { RUNE_SHAKE_FRAME_S } from "../arkynAnimations";
import ItemScene from "./ItemScene";
import Tooltip from "./Tooltip";
import goldIconUrl from "/assets/icons/gold-64x64.png?url";
import handFrameUrl from "/assets/ui/hand-frame.png?url";
import innerFrameUrl from "/assets/ui/inner-frame.png?url";
import { HAS_HOVER } from "./utils/hasHover";
import { renderDescription, SigilExplainer } from "./descriptionText";
import { useSigilDragReorder } from "./hooks/useSigilDragReorder";
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
    const accumulators = useSigilAccumulators();
    const activeSigilShake = useActiveSigilShake();
    const pendingSigilId = usePendingSigilId();
    const sigilProcBubble = useSigilProcBubble();
    const barRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef<HTMLDivElement>(null);
    const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
    const [selectedSigilId, setSelectedSigilId] = useState<string | null>(null);
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

    const { dragInfo, onSlotPointerDown } = useSigilDragReorder({
        sigils,
        containerRef: frameRef,
        onTap: (sigilId) => {
            setSelectedSigilId(prev => prev === sigilId ? null : sigilId);
        },
    });

    // Deselect when the user clicks outside the sigil bar. The slot's own
    // tap handler toggles selection, so in-bar taps are handled by React
    // state updates and this listener only fires for genuinely-outside clicks.
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

    // Combined hover + selection animation — tweens y / scale only, so it
    // does not conflict with the drag-aside x tween below (or the drag
    // hook's live x quickSetter on the dragged slot).
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

    // Drag-aside: when a sigil is being dragged, slide non-dragged slots
    // aside so the player can see the insertion target. Only tweens `x` —
    // hover/selection (y/scale) and the shake animation coexist without
    // overwrite conflicts.
    useGSAP(() => {
        const frame = frameRef.current;
        if (!frame) return;
        const slots = frame.querySelectorAll<HTMLElement>("[data-sigil-index]");
        if (slots.length === 0) return;
        if (!dragInfo) {
            // Drag ended (or never started) — zero x on all non-dragged
            // slots. The dragged slot was already zeroed by the hook.
            gsap.to(slots, { x: 0, duration: 0.18, ease: "power2.out", overwrite: "auto" });
            return;
        }
        const { originalIdx, previewIdx, sigilId: draggedId, slotStride } = dragInfo;
        slots.forEach((slot, index) => {
            // Skip the dragged slot — hook's quickSetter owns its x.
            if (slot.getAttribute("data-sigil-id") === draggedId) return;
            let targetX = 0;
            if (originalIdx < previewIdx && index > originalIdx && index <= previewIdx) {
                targetX = -slotStride;
            } else if (originalIdx > previewIdx && index < originalIdx && index >= previewIdx) {
                targetX = slotStride;
            }
            gsap.to(slot, { x: targetX, duration: 0.18, ease: "power2.out", overwrite: "auto" });
        });
    }, { dependencies: [dragInfo?.originalIdx, dragInfo?.previewIdx, dragInfo?.sigilId], scope: frameRef });

    return (
        <div ref={barRef} className={styles.wrapper}>
            <div ref={frameRef} className={styles.sigilFrame} style={slotFrameVars}>
                {sigils.map((sigilId, i) => {
                    const def = SIGIL_DEFINITIONS[sigilId];
                    if (!def) return null;
                    // When a sigil is mid-purchase (flying in from the shop)
                    // the slot is already in place (so the fly-in has a
                    // target rect) but the ItemScene + tooltip + tap handler
                    // are suppressed until the flyer lands.
                    const isPending = sigilId === pendingSigilId;

                    const rarityBg = RARITY_BG_COLORS[def.rarity] ?? "#6b6b6b";
                    const isSelected = selectedSigilId === sigilId;
                    const isDragging = dragInfo?.sigilId === sigilId;

                    // Accumulator sigils (Executioner et al.) expose a live xMult
                    // value that grows with gameplay — surface it in the tooltip
                    // so the player can check the current multiplier at a glance.
                    const accumulatorDef = SIGIL_ACCUMULATOR_XMULT[sigilId];
                    const accumulatorValue = accumulatorDef
                        ? (accumulators[sigilId] ?? accumulatorDef.initialValue)
                        : null;

                    // Inventory-mult sigils (Elixir et al.) derive their +Mult
                    // from the current sigil inventory — show the live computed
                    // bonus so the player can see how much the sigil is worth
                    // right now without casting a spell to find out.
                    const inventoryMultDef = SIGIL_INVENTORY_MULT[sigilId];
                    const inventoryMultValue = inventoryMultDef
                        ? inventoryMultDef.compute(sigils)
                        : null;

                    // Mimic "Copying: [Neighbor]" live readout — shows which
                    // sigil to the right is currently being copied. Three
                    // cases: no neighbor / incompatible neighbor / good
                    // neighbor. The dynamic section re-renders whenever the
                    // sigils array changes (drag reorder, buy, sell).
                    const mimicNeighborId = def.id === "mimic" ? sigils[i + 1] ?? null : null;
                    const mimicNeighborDef = mimicNeighborId
                        ? SIGIL_DEFINITIONS[mimicNeighborId] ?? null
                        : null;
                    const mimicNeighborIsIncompatible = !!mimicNeighborId
                        && MIMIC_INCOMPATIBLE.has(mimicNeighborId);

                    const slotClassName = `${styles.filledSlot}`
                        + (isSelected ? ` ${styles.filledSlotSelected}` : "")
                        + (isDragging ? ` ${styles.filledSlotDragging}` : "");

                    return (
                        <div
                            key={sigilId}
                            data-sigil-index={i}
                            data-sigil-id={sigilId}
                            ref={(el) => { slotRefs.current[i] = el; registerSigilSlot(i, el); }}
                            className={slotClassName}
                            style={{ opacity: isPending ? 0 : 1 }}
                            onPointerEnter={HAS_HOVER && !isPending ? () => setHoveredIdx(i) : undefined}
                            onPointerLeave={HAS_HOVER ? () => setHoveredIdx(prev => prev === i ? null : prev) : undefined}
                            onPointerDown={isPending ? undefined : (e) => onSlotPointerDown(e, sigilId, i)}
                            onDragStart={(e) => e.preventDefault()}
                        >
                            {!isPending && <ItemScene itemId={sigilId} index={i} />}
                            {/* Tooltip — centered below, hover-only (info) */}
                            {!isPending && (
                                <Tooltip placement="bottom" arrow variant="framed">
                                    <span className={styles.tooltipName}>
                                        {def.name}
                                    </span>
                                    <span
                                        className={styles.tooltipRarity}
                                        style={{ backgroundColor: rarityBg }}
                                    >
                                        {def.rarity}
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
                                        {def.id === "mimic" && (
                                            <div className={styles.tooltipMimicSection}>
                                                {mimicNeighborDef && !mimicNeighborIsIncompatible ? (
                                                    <>
                                                        <span className={styles.tooltipMimicLabel}>Copying</span>
                                                        <span className={styles.tooltipMimicName}>
                                                            {mimicNeighborDef.name}
                                                        </span>
                                                        <span>{renderDescription(mimicNeighborDef.description)}</span>
                                                    </>
                                                ) : mimicNeighborDef && mimicNeighborIsIncompatible ? (
                                                    <span className={styles.tooltipMimicHint}>
                                                        Cannot copy {mimicNeighborDef.name} — incompatible.
                                                    </span>
                                                ) : (
                                                    <span className={styles.tooltipMimicHint}>
                                                        Place another sigil to the right to copy its effect.
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    {/* Live-value rows (accumulator xMult / inventory-mult) sit
                                        in the slot the rarity badge used to occupy — keeps the
                                        tooltip layout uniform for sigils that have a growing
                                        number to surface. */}
                                    {accumulatorValue !== null && (
                                        <div className={styles.tooltipCurrentRow}>
                                            <span className={styles.tooltipCurrentLabel}>Current:</span>
                                            <span className={styles.tooltipCurrentValue}>
                                                {`x${accumulatorValue.toFixed(1)} Mult`}
                                            </span>
                                        </div>
                                    )}
                                    {inventoryMultValue !== null && (
                                        <div className={styles.tooltipCurrentRow}>
                                            <span className={styles.tooltipCurrentLabel}>Current:</span>
                                            <span className={styles.tooltipCurrentValue}>
                                                {`+${inventoryMultValue} Mult`}
                                            </span>
                                        </div>
                                    )}
                                </Tooltip>
                            )}
                            {/* Sell button — tap-to-reveal, stays until dismissed */}
                            {isSelected && !isPending && (
                                <button
                                    type="button"
                                    className={styles.sellButton}
                                    onPointerDown={(e) => { e.stopPropagation(); }}
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
                            {/* Floating "+N Gold" proc bubble — fires under a
                                sigil when its discard-hook (Banish) grants gold. */}
                            {sigilProcBubble && sigilProcBubble.sigilId === sigilId && sigilProcBubble.kind === "gold" && (
                                <SigilGoldProcBubble
                                    amount={sigilProcBubble.amount}
                                    seq={sigilProcBubble.seq}
                                />
                            )}
                            {/* Floating "+N.Nx" xMult proc bubble — fires under
                                an accumulator-xMult sigil (Executioner) per
                                critical hit as it grows the run's build. */}
                            {sigilProcBubble && sigilProcBubble.sigilId === sigilId && sigilProcBubble.kind === "xmult" && (
                                <SigilXMultProcBubble
                                    amount={sigilProcBubble.amount}
                                    seq={sigilProcBubble.seq}
                                />
                            )}
                        </div>
                    );
                })}
                <span className={styles.countLabel}>{sigils.length}/{MAX_SIGILS}</span>
            </div>
            <ConsumableBar />
        </div>
    );
}

/**
 * Floating "+N [gold icon]" overlay that pops under a sigil slot when
 * its discard-hook (Banish) grants gold. Seq-keyed remount replays the
 * GSAP tween on back-to-back procs. Positioned by the `.procBubble`
 * class in SigilBar.module.css (anchored to bottom of the slot); GSAP
 * animates translate-y + scale + opacity.
 */
function SigilGoldProcBubble({ amount, seq }: { amount: number; seq: number }) {
    const ref = useRef<HTMLSpanElement>(null);

    useGSAP(() => {
        const el = ref.current;
        if (!el) return;
        gsap.set(el, { y: -6, scale: 0.55, opacity: 0 });
        const tl = gsap.timeline();
        tl.to(el, { y: 8, scale: 1.2, opacity: 1, duration: 0.14, ease: "back.out(2.5)" });
        tl.to(el, { y: 12, scale: 1, duration: 0.08, ease: "power2.out" });
        tl.to({}, { duration: 0.35 });
        tl.to(el, { y: 32, opacity: 0, duration: 0.35, ease: "power1.in" });
    }, { dependencies: [seq], scope: ref });

    return (
        <span key={seq} ref={ref} className={styles.procBubble}>
            +{amount}
            <img src={goldIconUrl} alt="Gold" className={styles.procBubbleIcon} />
        </span>
    );
}

/**
 * Floating "+N.Nx" xMult proc bubble — pops below an accumulator-xMult
 * sigil (Executioner) on every critical hit. Red pill background + white
 * text to distinguish it from the warm-gold gold-proc bubble. Same GSAP
 * pop / drift / fade timing so the two bubble kinds read as siblings.
 */
function SigilXMultProcBubble({ amount, seq }: { amount: number; seq: number }) {
    const ref = useRef<HTMLSpanElement>(null);

    useGSAP(() => {
        const el = ref.current;
        if (!el) return;
        // Slight crooked tilt per pop — left or right, 3-7°. Randomized
        // each mount (seq-keyed) so rapid back-to-back crits don't all
        // lean the same way. Held constant through the tween so the pill
        // reads like a stamped-on sticker rather than a spin animation.
        const rotation = (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 4);
        gsap.set(el, { y: -6, scale: 0.55, opacity: 0, rotation });
        const tl = gsap.timeline();
        tl.to(el, { y: 8, scale: 1.2, opacity: 1, duration: 0.14, ease: "back.out(2.5)" });
        tl.to(el, { y: 12, scale: 1, duration: 0.08, ease: "power2.out" });
        tl.to({}, { duration: 0.35 });
        tl.to(el, { y: 32, opacity: 0, duration: 0.35, ease: "power1.in" });
    }, { dependencies: [seq], scope: ref });

    return (
        <span key={seq} ref={ref} className={`${styles.procBubble} ${styles.procBubbleXMult}`}>
            +{amount}x
        </span>
    );
}
