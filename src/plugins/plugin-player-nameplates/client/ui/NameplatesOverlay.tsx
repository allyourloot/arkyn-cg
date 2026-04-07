import { useNameplates } from "../nameplateStore";

export default function NameplatesOverlay() {
    const nameplates = useNameplates();

    return (
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 2000 }}>
            {nameplates.map((nameplate) => (
                <div
                    key={nameplate.sessionId}
                    style={{
                        position: "absolute",
                        left: `${nameplate.x}px`,
                        top: `${nameplate.y}px`,
                        transform: "translate(-50%, -100%)",
                        padding: "2px 8px",
                        borderRadius: "999px",
                        backgroundColor: "rgba(0, 0, 0, 0.65)",
                        color: "white",
                        fontSize: "12px",
                        fontWeight: 600,
                        letterSpacing: "0.2px",
                        whiteSpace: "nowrap",
                        textShadow: "0 1px 1px rgba(0, 0, 0, 0.45)",
                    }}
                >
                    {nameplate.username}
                </div>
            ))}
        </div>
    );
}
