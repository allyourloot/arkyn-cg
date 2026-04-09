import { useEffect, useState } from "react";

/**
 * Drives a CSS-transition-based "fly" animation. When `trigger` becomes
 * non-empty, returns `false` on the next render (so the consumer paints at
 * the origin position), then flips to `true` two `requestAnimationFrame`s
 * later so the CSS transition fires from origin → destination. When
 * `trigger` empties, resets to `false`.
 *
 * The double-RAF is intentional: the first RAF still runs in the same paint
 * frame as the React render that mounted the new positions, so the second
 * RAF is what guarantees the browser has actually committed the origin
 * positions before we change them.
 */
export function useFlyTrigger<T>(trigger: readonly T[]): boolean {
    const [animated, setAnimated] = useState(false);

    useEffect(() => {
        if (trigger.length > 0) {
            setAnimated(false);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => setAnimated(true));
            });
        } else {
            setAnimated(false);
        }
    }, [trigger]);

    return animated;
}
