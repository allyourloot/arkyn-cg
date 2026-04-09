import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { useDrawingRunes } from "../arkynStore";
import { DRAW_FLY_DURATION_S } from "../animations/castTimeline";
import RuneImage from "./RuneImage";
import styles from "./DrawAnimation.module.css";

const DRAW_STAGGER_S = 0.06;

export default function DrawAnimation() {
    const drawingRunes = useDrawingRunes();
    const layerRef = useRef<HTMLDivElement>(null);
    const flyerRefs = useRef<(HTMLDivElement | null)[]>([]);

    useGSAP(() => {
        if (drawingRunes.length === 0) return;
        // Compute the pouch origin once per draw cycle. The pouch counter
        // doesn't move during a single draw, so reading the rect once at
        // tween-construction time is fine.
        const pouchEl = document.querySelector("[data-pouch-counter]");
        const pouchRect = pouchEl?.getBoundingClientRect();
        const originX = pouchRect ? pouchRect.left + pouchRect.width / 2 : window.innerWidth - 40;
        const originY = pouchRect ? pouchRect.top + pouchRect.height / 2 : window.innerHeight - 40;

        const tl = gsap.timeline();
        drawingRunes.forEach((dr, i) => {
            const el = flyerRefs.current[i];
            if (!el) return;
            const half = dr.size / 2;
            // Snap to pouch origin (small + invisible), then animate to
            // hand slot (full size + visible).
            gsap.set(el, {
                x: originX - half,
                y: originY - half,
                scale: 0.4,
                opacity: 0,
            });
            tl.to(
                el,
                {
                    x: dr.toX - half,
                    y: dr.toY - half,
                    scale: 1,
                    opacity: 1,
                    duration: DRAW_FLY_DURATION_S,
                    ease: "back.out(1.4)",
                },
                i * DRAW_STAGGER_S,
            );
        });
    }, { dependencies: [drawingRunes], scope: layerRef });

    if (drawingRunes.length === 0) return null;

    return (
        <div ref={layerRef} className={styles.layer}>
            {drawingRunes.map((dr, i) => (
                <div
                    key={`draw-${dr.rune.id}-${i}`}
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
