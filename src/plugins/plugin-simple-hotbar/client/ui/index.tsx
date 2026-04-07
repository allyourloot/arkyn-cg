import { HOTBAR_SIZE } from "../../shared";
import { useHotbarSlots, useSelectedSlot, selectHotbarSlot } from "../hotbarStore";
import { BlockIsometricIcon } from "./BlockIsometricIcon";

export default function SimpleHotbarUI() {
    const slots = useHotbarSlots();
    const selectedSlot = useSelectedSlot();

    return (
        <div
            style={{
                pointerEvents: "none",
                position: "fixed",
                left: 0,
                right: 0,
                bottom: 24,
                zIndex: 500,
                display: "flex",
                justifyContent: "center",
            }}
        >
            <div
                style={{
                    pointerEvents: "auto",
                    display: "flex",
                    gap: 10,
                    borderRadius: 8,
                    border: "1px solid rgba(63, 63, 70, 0.8)",
                    backgroundColor: "rgba(24, 24, 27, 0.8)",
                    padding: 12,
                    backdropFilter: "blur(4px)",
                }}
            >
                {Array.from({ length: HOTBAR_SIZE }, (_, index) => {
                    const isSelected = selectedSlot === index;
                    const slotValue = slots[index] ?? 0;
                    const hasBlock = slotValue > 0;

                    return (
                        <button
                            key={index}
                            type="button"
                            style={{
                                display: "flex",
                                height: 56,
                                width: 56,
                                cursor: "pointer",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 4,
                                borderRadius: 6,
                                border: isSelected
                                    ? "1px solid rgb(52, 211, 153)"
                                    : "1px solid rgb(82, 82, 91)",
                                color: "rgb(244, 244, 245)",
                                transition: "background-color 150ms ease, border-color 150ms ease",
                                backgroundColor: isSelected
                                    ? "rgba(63, 63, 70, 0.7)"
                                    : "rgba(39, 39, 42, 0.7)",
                            }}
                            onMouseEnter={(event) => {
                                if (!isSelected) {
                                    event.currentTarget.style.borderColor = "rgb(113, 113, 122)";
                                }
                            }}
                            onMouseLeave={(event) => {
                                if (!isSelected) {
                                    event.currentTarget.style.borderColor = "rgb(82, 82, 91)";
                                }
                            }}
                            onClick={() => selectHotbarSlot(index)}
                            aria-label={`Select hotbar slot ${index + 1}`}
                        >
                            <span style={{ fontSize: 10, color: "rgb(161, 161, 170)" }}>
                                {index + 1}
                            </span>
                            {hasBlock ? (
                                <BlockIsometricIcon blockId={slotValue} size={36} />
                            ) : (
                                <div style={{ height: 32, width: 32 }} />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
