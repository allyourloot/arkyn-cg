import { useEffect } from "react";

/**
 * Fires `handler` whenever the Escape key is pressed at the window level.
 * Auto-cleans up the listener on unmount or when `handler` changes — wrap
 * the handler in `useCallback` if it has dependencies, otherwise the
 * listener will re-bind every render.
 */
export function useEscapeKey(handler: () => void): void {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") handler();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [handler]);
}
