import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { useDiscardingRunes } from "../arkynStore";
import { DISCARD_FLY_DURATION_S } from "../animations/castTimeline";
import RuneImage from "./RuneImage";
import styles from "./DiscardAnimation.module.css";

const DISCARD_STAGGER_S = 0.04;

export default function DiscardAnimation() {
    const discardingRunes = useDiscardingRunes();
    const layerRef = useRef<HTMLDivElement>(null);
    const flyerRefs = useRef<(HTMLDivElement | null)[]>([]);

    useGSAP(() => {
        if (discardingRunes.length === 0) return;
        const tl = gsap.timeline();
        discardingRunes.forEach((dr, i) => {
            const el = flyerRefs.current[i];
            if (!el) return;
            const half = dr.size / 2;
            // Snap to origin, then run the discard tween: drop down ~200px
            // while shrinking, rotating, and fading.
            gsap.set(el, {
                x: dr.fromX - half,
                y: dr.fromY - half,
                scale: 1,
                rotation: 0,
                opacity: 1,
            });
            tl.to(
                el,
                {
                    y: `+=200`,
                    scale: 0.4,
                    rotation: 15,
                    opacity: 0,
                    duration: DISCARD_FLY_DURATION_S,
                    ease: "power2.in",
                },
                i * DISCARD_STAGGER_S,
            );
        });
    }, { dependencies: [discardingRunes], scope: layerRef });

    if (discardingRunes.length === 0) return null;

    return (
        <div ref={layerRef} className={styles.layer}>
            {discardingRunes.map((dr, i) => (
                <div
                    key={`discard-${dr.rune.id}-${i}`}
                    ref={(el) => { flyerRefs.current[i] = el; }}
                    className={styles.flyer}
                    style={{
                        left: 0,
                        top: 0,
                        width: dr.size,
                        height: dr.size,
                    }}
                >
                    <RuneImage
                        rarity={dr.rune.rarity}
                        element={dr.rune.element}
                        className={styles.runeImg}
                    />
                </div>
            ))}
        </div>
    );
}
