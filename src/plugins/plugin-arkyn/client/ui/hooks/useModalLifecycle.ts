import { useCallback, useEffect } from "react";
import { playMenuClose, playMenuOpen } from "../../sfx";
import { useEscapeKey } from "./useEscapeKey";

/**
 * Standard modal lifecycle: plays the menu-open stinger on mount, returns a
 * `closeWithSfx` callback that plays the menu-close stinger and then calls
 * the consumer's `onClose`, and binds Escape to that same dismiss path.
 *
 * Modals should call this once and route every dismiss path (backdrop click,
 * X button, internal close action) through the returned `closeWithSfx` so
 * the close stinger fires exactly once per dismiss regardless of which path
 * the user took.
 */
export function useModalLifecycle(onClose: () => void): () => void {
    useEffect(() => {
        playMenuOpen();
    }, []);

    const closeWithSfx = useCallback(() => {
        playMenuClose();
        onClose();
    }, [onClose]);

    useEscapeKey(closeWithSfx);

    return closeWithSfx;
}
