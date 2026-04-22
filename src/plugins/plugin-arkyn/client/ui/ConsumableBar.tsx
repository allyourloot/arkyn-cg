import { useEffect, useRef, useState, type CSSProperties } from "react";
import { MAX_CONSUMABLES, getConsumableDefinition, getScrollLevelsPerUse } from "../../shared";
import {
    useConsumables,
    useScrollLevels,
    useGamePhase,
    useSigils,
    sendUseConsumable,
    emitScrollPurchase,
    setScrollUpgradeDisplay,
} from "../arkynStore";
import { playCount } from "../sfx";
import { getScrollImageUrl } from "./scrollAssets";
import ItemScene from "./ItemScene";
import Tooltip from "./Tooltip";
import handFrameUrl from "/assets/ui/hand-frame.png?url";
import styles from "./ConsumableBar.module.css";

const frameVars = {
    "--slot-bg": `url(${handFrameUrl})`,
} as CSSProperties;

export default function ConsumableBar() {
    const consumables = useConsumables();
    const scrollLevels = useScrollLevels();
    const gamePhase = useGamePhase();
    const sigils = useSigils();
    const barRef = useRef<HTMLDivElement>(null);
    const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
    const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Per-use scheduled animation timeouts (level-step display + count SFX
    // pitches). Kept as an array so a rapid second Use cleanly cancels any
    // still-pending ticks from the previous use, preventing the "+0 → +2"
    // of use N from overlapping the "+0 → ?" of use N+1.
    const stepTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

    useEffect(() => {
        if (selectedIdx === null) return;
        const handleDocClick = (e: MouseEvent) => {
            if (barRef.current && !barRef.current.contains(e.target as Node)) {
                setSelectedIdx(null);
            }
        };
        document.addEventListener("click", handleDocClick);
        return () => document.removeEventListener("click", handleDocClick);
    }, [selectedIdx]);

    useEffect(() => {
        if (selectedIdx !== null && selectedIdx >= consumables.length) {
            setSelectedIdx(null);
        }
    }, [consumables, selectedIdx]);

    useEffect(() => {
        return () => {
            if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
            for (const t of stepTimeoutsRef.current) clearTimeout(t);
            stepTimeoutsRef.current = [];
        };
    }, []);

    const handleUse = (index: number, element: string) => {
        const currentLevel = scrollLevels.get(element) ?? 0;
        const levelsGained = getScrollLevelsPerUse(sigils);
        const slotEl = slotRefs.current[index];
        const fromRect = slotEl?.getBoundingClientRect() ?? new DOMRect(
            window.innerWidth / 2, window.innerHeight / 2, 0, 0,
        );
        sendUseConsumable(index);

        if (gamePhase === "shop") {
            emitScrollPurchase({
                element,
                oldLevel: currentLevel + 1,
                newLevel: currentLevel + 1 + levelsGained,
                fromRect,
            });
        } else {
            // Playing phase — no fly animation, but step through each level
            // gain one at a time with the same per-step display + count SFX
            // the shop orchestrator uses. With Scroll God, +2 levels read as
            // "+0 → +2" then "+2 → +4" (two distinct pops) instead of a
            // single "+0 → +4" flash. Matches ArkynOverlay's shop scroll
            // animation step loop byte-for-byte: same step timing (850ms),
            // same 3 count-SFX pitches per step.
            if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
            for (const t of stepTimeoutsRef.current) clearTimeout(t);
            stepTimeoutsRef.current = [];

            const oldLevelBase = currentLevel + 1;
            const STEP_MS = 850;
            const COUNT_PITCH_DELAYS_MS = [0, 150, 300];
            const COUNT_PITCHES = [1.0, 1.15, 1.3];

            const steps = Math.max(1, levelsGained);
            for (let i = 0; i < steps; i++) {
                const stepOldLevel = oldLevelBase + i;
                const stepNewLevel = stepOldLevel + 1;
                const stepStartMs = i * STEP_MS;
                stepTimeoutsRef.current.push(setTimeout(() => {
                    setScrollUpgradeDisplay({
                        element,
                        oldLevel: stepOldLevel,
                        newLevel: stepNewLevel,
                    });
                }, stepStartMs));
                for (let p = 0; p < COUNT_PITCHES.length; p++) {
                    const pitch = COUNT_PITCHES[p];
                    stepTimeoutsRef.current.push(setTimeout(() => {
                        playCount(pitch);
                    }, stepStartMs + COUNT_PITCH_DELAYS_MS[p]));
                }
            }

            // Tail hold so the final "+N → +M" stays up long enough to read
            // after the last step's count SFX has played.
            const totalDurationMs = steps * STEP_MS + 1500;
            clearTimerRef.current = setTimeout(() => {
                setScrollUpgradeDisplay(null);
                clearTimerRef.current = null;
            }, totalDurationMs);
        }

        setSelectedIdx(null);
    };

    return (
        <div ref={barRef} className={styles.wrapper} style={frameVars}>
            {Array.from({ length: MAX_CONSUMABLES }, (_, i) => {
                const consumableId = consumables[i];
                if (!consumableId) return null;

                const def = getConsumableDefinition(consumableId);
                // Scroll consumables store the element as the id; fall back to
                // that when a future consumable kind arrives without art yet.
                const iconElement = def?.effect.type === "upgradeScroll"
                    ? def.effect.element
                    : consumableId;
                const scrollUrl = getScrollImageUrl(iconElement);
                const displayName = def?.name ?? consumableId;
                const isSelected = selectedIdx === i;

                return (
                    <div
                        key={`${consumableId}-${i}`}
                        ref={(el) => { slotRefs.current[i] = el; }}
                        className={`${styles.filledSlot} ${isSelected ? styles.filledSlotSelected : ""}`}
                        onClick={() => setSelectedIdx(prev => prev === i ? null : i)}
                    >
                        <ItemScene
                            itemId={consumableId}
                            index={100 + i}
                            imageUrl={scrollUrl}
                            className={styles.scrollCanvas}
                        />
                        <Tooltip placement="bottom" arrow variant="framed">
                            <span className={styles.tooltipName}>
                                {displayName}
                            </span>
                        </Tooltip>
                        {isSelected && (
                            <button
                                type="button"
                                className={styles.useButton}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleUse(i, iconElement);
                                }}
                            >
                                Use
                            </button>
                        )}
                    </div>
                );
            })}
            <span className={styles.countLabel}>{consumables.length}/{MAX_CONSUMABLES}</span>
        </div>
    );
}
