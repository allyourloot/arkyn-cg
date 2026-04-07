import { useEffect } from "react";
import {
    useHotbarSlots,
    useSelectedSlot,
    selectHotbarSlot,
    setHotbarItem,
    getHotbarSize,
    getFakeCursorPosition,
    onFakeCursorPointerEvent,
    setFakeCursorVisible,
} from "../pluginInterfaces";
import {
    useInventoryStore,
    getBlockMeta,
    startInventoryBlockDrag,
    stopInventoryBlockDrag,
    sendSetHotbarItem,
    setInventoryOpen,
    toggleInventory,
} from "../inventoryStore";
import { BlockIsometricIcon } from "./BlockIsometricIcon";
import type { CSSProperties } from "react";

const INVENTORY_BLOCK_ID_ATTR = "data-inventory-block-id";
const HOTBAR_SLOT_ATTR = "data-hotbar-slot-index";
const VISIBLE_ROWS = 5;
const TILE_SIZE = 56;
const GRID_GAP = 10;
const SCROLL_MAX_HEIGHT = VISIBLE_ROWS * TILE_SIZE + (VISIBLE_ROWS - 1) * GRID_GAP;

const styles: Record<string, CSSProperties> = {
    toggleButton: {
        pointerEvents: "auto",
        position: "fixed",
        left: "1rem",
        top: "1rem",
        zIndex: 40,
        borderRadius: "0.25rem",
        border: "1px solid #52525b",
        background: "rgba(24, 24, 27, 0.75)",
        padding: "0.5rem 0.75rem",
        fontSize: "0.75rem",
        color: "#f4f4f5",
    },
    overlay: {
        pointerEvents: "auto",
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "none",
        background: "rgba(0, 0, 0, 0.7)",
        padding: "0 1rem",
    },
    panelStack: {
        display: "flex",
        maxHeight: "84vh",
        flexDirection: "column",
        gap: "1rem",
        overflow: "hidden",
    },
    panel: {
        borderRadius: "0.5rem",
        border: "1px solid #3f3f46",
        background: "rgba(24, 24, 27, 0.85)",
        padding: "0.75rem",
    },
    heading: {
        marginBottom: "0.75rem",
        fontSize: "0.875rem",
        fontWeight: 600,
        color: "#e4e4e7",
    },
    hotbarGrid: {
        display: "grid",
        gap: "10px",
    },
    slotButton: {
        display: "flex",
        height: "56px",
        width: "56px",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "0.25rem",
        border: "1px solid #52525b",
        background: "rgba(39, 39, 42, 0.8)",
        color: "#f4f4f5",
    },
    slotButtonSelected: {
        border: "1px solid #34d399",
        background: "rgba(63, 63, 70, 0.7)",
    },
    slotIndexLabel: {
        fontSize: "10px",
        color: "#a1a1aa",
    },
    slotEmpty: {
        height: "32px",
        width: "32px",
    },
    loadingText: {
        fontSize: "0.75rem",
        color: "#a1a1aa",
    },
    blocksScroll: {
        overflowY: "auto",
        overflowX: "hidden",
        paddingRight: "0.25rem",
    },
    blocksGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(9, minmax(0, 1fr))",
        gap: `${GRID_GAP}px`,
    },
    blockButton: {
        display: "flex",
        height: "56px",
        width: "56px",
        cursor: "none",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "0.25rem",
        border: "1px solid #52525b",
        background: "rgba(39, 39, 42, 0.8)",
        color: "#f4f4f5",
    },
};

function getElementsAtFakeCursor() {
    const { x, y } = getFakeCursorPosition();
    return document.elementsFromPoint(x, y);
}

function getBlockIdAtFakeCursor() {
    for (const el of getElementsAtFakeCursor()) {
        if (!(el instanceof HTMLElement)) continue;
        const target = el.closest(`[${INVENTORY_BLOCK_ID_ATTR}]`) as HTMLElement | null;
        if (!target) continue;
        const blockId = Number(target.dataset.inventoryBlockId);
        if (Number.isInteger(blockId) && blockId > 0) return blockId;
    }
    return null;
}

function getHotbarSlotAtFakeCursor() {
    const hotbarSize = getHotbarSize();
    for (const el of getElementsAtFakeCursor()) {
        if (!(el instanceof HTMLElement)) continue;
        const target = el.closest(`[${HOTBAR_SLOT_ATTR}]`) as HTMLElement | null;
        if (!target) continue;
        const slotIndex = Number(target.dataset.hotbarSlotIndex);
        if (Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < hotbarSize) return slotIndex;
    }
    return null;
}

export default function InventoryMenu() {
    const { isOpen, blockIds, isDragging, dragBlockId } = useInventoryStore();
    const selectedHotbarSlot = useSelectedSlot();
    const hotbarSlots = useHotbarSlots();
    const hotbarSize = getHotbarSize();

    useEffect(() => {
        setFakeCursorVisible(isOpen);
        if (!isOpen) stopInventoryBlockDrag();
    }, [isOpen]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.repeat) return;
            if (event.code === "KeyE") {
                event.preventDefault();
                toggleInventory();
                return;
            }
            if (event.code === "Escape") {
                setInventoryOpen(false);
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    const dropToSlot = (slotIndex: number) => {
        if (!isDragging || dragBlockId <= 0) return;
        setHotbarItem(slotIndex, dragBlockId);
        sendSetHotbarItem(slotIndex, dragBlockId);
        stopInventoryBlockDrag();
    };

    useEffect(() => {
        if (!isOpen) return;

        const unsubscribe = onFakeCursorPointerEvent((event) => {
            if (event.button !== 0) return;

            if (event.type === "down") {
                const blockId = getBlockIdAtFakeCursor();
                if (blockId === null) return;
                startInventoryBlockDrag(blockId);
                event.nativeEvent.preventDefault();
                return;
            }

            if (!isDragging) return;

            const slotIndex = getHotbarSlotAtFakeCursor();
            if (slotIndex !== null) {
                setHotbarItem(slotIndex, dragBlockId);
                sendSetHotbarItem(slotIndex, dragBlockId);
            }
            stopInventoryBlockDrag();
            event.nativeEvent.preventDefault();
        });

        return () => unsubscribe();
    }, [dragBlockId, isDragging, isOpen]);

    return (
        <>
            <button
                type="button"
                onClick={() => toggleInventory()}
                style={styles.toggleButton}
            >
                Blocks [E]
            </button>

            {isOpen && (
                <div
                    style={styles.overlay}
                    onMouseUp={() => {
                        if (isDragging) stopInventoryBlockDrag();
                    }}
                >
                    <div style={styles.panelStack}>
                        <section>
                            <div style={styles.panel}>
                                <h2 style={styles.heading}>
                                    {`Hotbar (${hotbarSize} slots)`}
                                </h2>
                                <div
                                    style={{
                                        ...styles.hotbarGrid,
                                        gridTemplateColumns: `repeat(${hotbarSize}, minmax(0, 1fr))`,
                                    }}
                                >
                                    {Array.from({ length: hotbarSize }, (_, index) => {
                                        const slotValue = hotbarSlots[index] ?? 0;
                                        const isSelected = selectedHotbarSlot === index;
                                        const slotMeta = slotValue > 0 ? getBlockMeta(slotValue) : null;

                                        return (
                                            <button
                                                key={`inv-hotbar-${index}`}
                                                type="button"
                                                data-hotbar-slot-index={index}
                                                onClick={() => selectHotbarSlot(index)}
                                                onMouseUp={(e) => {
                                                    e.preventDefault();
                                                    dropToSlot(index);
                                                }}
                                                style={isSelected ? { ...styles.slotButton, ...styles.slotButtonSelected } : styles.slotButton}
                                                title={slotMeta?.name ?? `Hotbar slot ${index + 1}`}
                                            >
                                                <span style={styles.slotIndexLabel}>{index + 1}</span>
                                                {slotValue > 0 ? (
                                                    <BlockIsometricIcon blockId={slotValue} size={38} />
                                                ) : (
                                                    <div style={styles.slotEmpty} />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </section>

                        <section>
                            <div style={styles.panel}>
                                <h2 style={styles.heading}>
                                    {`Registered Blocks (${blockIds.length})`}
                                </h2>
                                {blockIds.length === 0 ? (
                                    <p style={styles.loadingText}>Loading registered blocks...</p>
                                ) : (
                                    <div
                                        style={{ ...styles.blocksScroll, maxHeight: `${SCROLL_MAX_HEIGHT}px` }}
                                    >
                                        <div style={styles.blocksGrid}>
                                            {blockIds.map((blockId) => {
                                                const meta = getBlockMeta(blockId);
                                                return (
                                                    <button
                                                        key={`inv-block-${blockId}`}
                                                        type="button"
                                                        data-inventory-block-id={blockId}
                                                        style={styles.blockButton}
                                                        title={isDragging ? `Dragging ${meta.name}` : `Drag ${meta.name} to a hotbar slot`}
                                                    >
                                                        <BlockIsometricIcon blockId={blockId} size={38} />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                </div>
            )}
        </>
    );
}
