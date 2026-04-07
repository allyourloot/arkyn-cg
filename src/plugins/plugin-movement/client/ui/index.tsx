import { useEffect, useState } from "react";

function getGameCanvas(): HTMLCanvasElement | null {
    const el = document.querySelector("#game-canvas canvas");
    return el instanceof HTMLCanvasElement ? el : null;
}

function isPointerLocked() {
    const canvas = getGameCanvas();
    return Boolean(canvas && document.pointerLockElement === canvas);
}

function isTouchDevice() {
    return navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches;
}

export default function MovementUI() {
    const [hasCanvas, setHasCanvas] = useState(() => Boolean(getGameCanvas()));
    const [locked, setLocked] = useState(() => isPointerLocked());
    const [touchDevice, setTouchDevice] = useState(() => isTouchDevice());

    useEffect(() => {
        const sync = () => {
            setHasCanvas(Boolean(getGameCanvas()));
            setLocked(isPointerLocked());
            setTouchDevice(isTouchDevice());
        };

        const interval = window.setInterval(sync, 250);
        document.addEventListener("pointerlockchange", sync);
        window.addEventListener("focus", sync);
        window.addEventListener("blur", sync);

        return () => {
            window.clearInterval(interval);
            document.removeEventListener("pointerlockchange", sync);
            window.removeEventListener("focus", sync);
            window.removeEventListener("blur", sync);
        };
    }, []);

    if (!hasCanvas || locked || touchDevice) {
        return null;
    }

    const requestPointerLock = () => {
        const canvas = getGameCanvas();
        if (!canvas || document.pointerLockElement === canvas) return;
        canvas.focus();
        canvas.requestPointerLock();
    };

    return (
        <button
            type="button"
            onClick={requestPointerLock}
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 1000,
                display: "flex",
                cursor: "pointer",
                alignItems: "center",
                justifyContent: "center",
                border: "0",
                backgroundColor: "rgba(0, 0, 0, 0.6)",
                color: "white",
            }}
        >
            <div
                style={{
                    borderRadius: "12px",
                    border: "1px solid rgba(255, 255, 255, 0.3)",
                    backgroundColor: "rgba(0, 0, 0, 0.5)",
                    padding: "24px",
                    textAlign: "center",
                }}
            >
                <div style={{
                    fontSize: "18px",
                    fontWeight: "600",
                    letterSpacing: "0.3px",
                }}>Click anywhere to continue</div>
                <div style={{
                    marginTop: "8px",
                    fontSize: "14px",
                    color: "rgba(255, 255, 255, 0.7)",
                }}>Pointer lock is required to play this game</div>
            </div>
        </button>
    );
}
