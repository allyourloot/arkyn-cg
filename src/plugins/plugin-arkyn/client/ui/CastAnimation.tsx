import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { useFlyingRunes } from "../arkynStore";
import { FLY_DURATION_S } from "../animations/castTimeline";
import RuneImage from "./RuneImage";
import styles from "./CastAnimation.module.css";

// Per-flyer stagger between successive runes' fly tweens. Matches the
// pre-migration `transitionDelay: i * 60ms` so the visual cadence is
// preserved.
const FLY_STAGGER_S = 0.06;

export default function CastAnimation() {
    const flyingRunes = useFlyingRunes();
    const layerRef = useRef<HTMLDivElement>(null);
    const flyerRefs = useRef<(HTMLDivElement | null)[]>([]);

    useGSAP(() => {
        if (flyingRunes.length === 0) return;
        const tl = gsap.timeline();
        flyingRunes.forEach((fr, i) => {
            const el = flyerRefs.current[i];
            if (!el) return;
            const half = fr.size / 2;
            // Snap to origin first (gsap.set is instant), then animate to
            // destination delta. The element's CSS left/top is 0; we drive
            // movement entirely through transform x/y for compositor-only
            // updates.
            gsap.set(el, { x: fr.fromX - half, y: fr.fromY - half });
            tl.to(
                el,
                {
                    x: fr.toX - half,
                    y: fr.toY - half,
                    duration: FLY_DURATION_S,
                    ease: "power2.inOut",
                },
                i * FLY_STAGGER_S,
            );
        });
    }, { dependencies: [flyingRunes], scope: layerRef });

    if (flyingRunes.length === 0) return null;

    return (
        <div ref={layerRef} className={styles.layer}>
            {flyingRunes.map((fr, i) => (
                <div
                    key={`fly-${fr.rune.id}-${i}`}
                    ref={(el) => { flyerRefs.current[i] = el; }}
                    className={styles.flyer}
                    style={{
                        // left/top stay at 0; the GSAP tween drives x/y
                        // (via transform) so the layer never reflows.
                        left: 0,
                        top: 0,
                        width: fr.size,
                        height: fr.size,
                    }}
                >
                    <RuneImage
                        rarity={fr.rune.rarity}
                        element={fr.rune.element}
                        className={styles.runeImg}
                    />
                </div>
            ))}
        </div>
    );
}
