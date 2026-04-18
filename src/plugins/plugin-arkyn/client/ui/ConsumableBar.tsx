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
        return () => { if (clearTimerRef.current) clearTimeout(clearTimerRef.current); };
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
            // Playing phase — no fly animation; just show the final upgrade
            // display and clear after a hold. Intermediate steps aren't
            // staged here because there's no orchestrator timeline outside
            // of the shop; the player reads the final value only.
            setScrollUpgradeDisplay({
                element,
                oldLevel: currentLevel + 1,
                newLevel: currentLevel + 1 + levelsGained,
            });
            if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
            clearTimerRef.current = setTimeout(() => {
                setScrollUpgradeDisplay(null);
                clearTimerRef.current = null;
            }, 2500);
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
