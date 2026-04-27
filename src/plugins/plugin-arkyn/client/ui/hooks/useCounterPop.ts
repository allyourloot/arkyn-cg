import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import type { RefObject } from "react";

/**
 * Plays a scale pop (1.45 → 1) on the referenced element when `value`
 * increments during a cast animation. No-op when the cast isn't animating
 * or `value` is zero/negative — both signals mean "no fresh damage tick to
 * react to" so the element should sit at its resting transform.
 *
 * Used by the Spell Preview's Base / Mult / Total chips during cast,
 * and reusable by any other counter readout that wants the same feel.
 */
export function useCounterPop(
    ref: RefObject<HTMLElement | null>,
    value: number,
    isCastAnimating: boolean,
): void {
    useGSAP(() => {
        if (!ref.current) return;
        if (!isCastAnimating || value <= 0) return;
        gsap.fromTo(
            ref.current,
            { scale: 1.45 },
            { scale: 1, duration: 0.32, ease: "back.out(2.6)", overwrite: "auto" },
        );
    }, { dependencies: [value, isCastAnimating], scope: ref });
}
