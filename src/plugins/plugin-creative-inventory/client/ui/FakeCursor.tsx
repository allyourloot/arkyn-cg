import { useFakeCursor } from "../pluginInterfaces";
import { useInventoryStore } from "../inventoryStore";
import { BlockIsometricIcon } from "./BlockIsometricIcon";
import type { CSSProperties } from "react";

const styles: Record<string, CSSProperties> = {
    cursorRoot: {
        pointerEvents: "none",
        position: "fixed",
        zIndex: 999,
        transform: "translate(-50%, -50%)",
    },
    draggingPreview: {
        borderRadius: "0.25rem",
        border: "1px solid #71717a",
        background: "rgba(24, 24, 27, 0.85)",
        padding: "0.25rem",
        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.35), 0 4px 6px -4px rgba(0, 0, 0, 0.35)",
    },
    cursorDot: {
        height: "16px",
        width: "16px",
        borderRadius: "9999px",
        border: "1px solid #e4e4e7",
        background: "rgba(24, 24, 27, 0.8)",
    },
};

export default function FakeCursor() {
    const { isOpen, isDragging, dragBlockId } = useInventoryStore();
    const { x, y, visible } = useFakeCursor();

    if (!isOpen || !visible) return null;

    return (
        <div
            style={{ ...styles.cursorRoot, left: `${x}px`, top: `${y}px` }}
        >
            {isDragging && dragBlockId > 0 ? (
                <div style={styles.draggingPreview}>
                    <BlockIsometricIcon blockId={dragBlockId} size={38} />
                </div>
            ) : (
                <div style={styles.cursorDot} />
            )}
        </div>
    );
}
