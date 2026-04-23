import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
    useDissolvingRunes,
    useDissolveStartTime,
    useFlyingRunes,
    useRaisedSlotIndices,
    useRuneDamageBubbles,
    useProcDamageBubbles,
    DISSOLVE_DURATION_MS,
    DISSOLVE_STAGGER_MS,
    RAISE_LIFT_PX,
    SLOT_RAISE_S,
    SLOT_LOWER_S,
    RUNE_SHAKE_FRAME_S,
} from "../arkynStore";
import { MAX_PLAY } from "../../shared";
import DissolveCanvas from "./DissolveCanvas";
import RuneDamageBubble from "./RuneDamageBubble";
import { getRuneImageUrl, getBaseRuneImageUrl } from "./runeAssets";
import styles from "./PlayArea.module.css";

export default function PlayArea() {
    const dissolvingRunes = useDissolvingRunes();
    const dissolveStartTime = useDissolveStartTime();
    const flyingRunes = useFlyingRunes();
    const raisedSlotIndices = useRaisedSlotIndices();
    const runeDamageBubbles = useRuneDamageBubbles();
    const procDamageBubbles = useProcDamageBubbles();

    // Hide the dissolve layer while flyers are still in transit. The
    // dissolving runes are pre-mounted at cast start so their WebGL
    // contexts boot and textures decode during the fly window — but the
    // flyers sit at different DOM positions and can't be seen-through, so
    // we keep the play-area copies invisible until the flyers have all
    // landed and unmounted. Flipping opacity at that instant reveals the
    // already-rendered canvas underneath with zero blank frames.
    const runesVisible = flyingRunes.length === 0;

    const areaRef = useRef<HTMLDivElement>(null);
    const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
    const shakeRefs = useRef<(HTMLDivElement | null)[]>([]);

    // The empty slot uses the "common" base rune art with a desaturating
    // filter applied via CSS so it reads as a faded placeholder.
    const placeholderUrl = getBaseRuneImageUrl("common");

    // Slot raise: lift contributing slots with a back-out overshoot, drop
    // non-contributing slots back to 0 with power3.out. `overwrite: 'auto'`
    // lets the tween retarget cleanly if a new cast starts mid-raise.
    useGSAP(() => {
        for (let i = 0; i < MAX_PLAY; i++) {
            const slot = slotRefs.current[i];
            if (!slot) continue;
            const isRaised = raisedSlotIndices.includes(i);
            gsap.to(slot, {
                y: isRaised ? RAISE_LIFT_PX : 0,
                duration: isRaised ? SLOT_RAISE_S : SLOT_LOWER_S,
                ease: isRaised ? "back.out(1.7)" : "power3.out",
                overwrite: "auto",
            });
        }
    }, { dependencies: [raisedSlotIndices], scope: areaRef });

    // Per-rune count shake: every time a new bubble batch mounts, replay
    // the shake on each contributing rune wrapper at its bubble's delayMs
    // offset. The shake is intentionally subtle (small translate, gentle
    // rotate, tiny scale) so it reads as "the rune flinched" rather than
    // a wobble. Proc bubbles get their own shake at each proc's delay —
    // multi-proc slots (Mimic+Chainlink stacking two retriggers) replay
    // the shake once per proc so the rune visibly reacts to every hit.
    useGSAP(() => {
        for (let i = 0; i < MAX_PLAY; i++) {
            const wrapper = shakeRefs.current[i];
            if (!wrapper) continue;

            const bubble = runeDamageBubbles[i];
            const procBubblesForSlot = procDamageBubbles[i] ?? [];
            if (!bubble && procBubblesForSlot.length === 0) continue;

            const shakeKeyframes = [
                { x: -1.5, y: -0.5, rotation: -1, scale: 1.04, duration: RUNE_SHAKE_FRAME_S },
                { x: 1.5, y: 0.5, rotation: 1, scale: 1.06, duration: RUNE_SHAKE_FRAME_S },
                { x: -1, y: 0, rotation: -0.5, scale: 1.03, duration: RUNE_SHAKE_FRAME_S },
                { x: 0.5, y: 0, rotation: 0.25, scale: 1.01, duration: RUNE_SHAKE_FRAME_S },
                { x: 0, y: 0, rotation: 0, scale: 1, duration: RUNE_SHAKE_FRAME_S },
            ];

            // Normal bubble shake
            if (bubble) {
                gsap.set(wrapper, { x: 0, y: 0, rotation: 0, scale: 1 });
                gsap.to(wrapper, {
                    keyframes: shakeKeyframes,
                    ease: "power2.out",
                    delay: bubble.delayMs / 1000,
                    overwrite: "auto",
                });
            }
            // Proc bubble shakes — one per proc at its delay, so Mimic-
            // stacked retriggers flinch the rune on every hit.
            for (const procBubble of procBubblesForSlot) {
                gsap.to(wrapper, {
                    keyframes: shakeKeyframes,
                    ease: "power2.out",
                    delay: procBubble.delayMs / 1000,
                    overwrite: "auto",
                });
            }
        }
    }, { dependencies: [runeDamageBubbles, procDamageBubbles], scope: areaRef });

    return (
        <div ref={areaRef} className={styles.area}>
            {Array.from({ length: MAX_PLAY }, (_, i) => {
                const dissolving = dissolvingRunes[i];
                const damageBubble = runeDamageBubbles[i] ?? null;
                const procBubblesForSlot = procDamageBubbles[i] ?? [];

                return (
                    <div
                        key={i}
                        ref={(el) => { slotRefs.current[i] = el; }}
                        data-slot-index={i}
                        className={styles.slot}
                    >
                        {/* Static "ghost" placeholder — always rendered so the
                            play area shape never disappears mid-dissolve.
                            Lives inside the slot so when a slot is raised
                            both the placeholder and the rune lift together
                            as one unit. */}
                        {placeholderUrl && (
                            <img
                                src={placeholderUrl}
                                alt=""
                                className={styles.placeholder}
                                draggable={false}
                            />
                        )}
                        {dissolving && (
                            <div
                                ref={(el) => { shakeRefs.current[i] = el; }}
                                className={styles.runeShake}
                                style={{ opacity: runesVisible ? 1 : 0 }}
                            >
                                <DissolveCanvas
                                    element={dissolving.element}
                                    rune={{
                                        baseUrl: getBaseRuneImageUrl(dissolving.rarity),
                                        runeUrl: getRuneImageUrl(dissolving.element),
                                    }}
                                    // Stagger each rune so they dissolve one after
                                    // another for a more dramatic spell impact.
                                    startTime={dissolveStartTime + i * DISSOLVE_STAGGER_MS}
                                    duration={DISSOLVE_DURATION_MS}
                                />
                            </div>
                        )}
                        {damageBubble && (
                            <RuneDamageBubble
                                amount={damageBubble.amount}
                                baseAmount={damageBubble.baseAmount}
                                spellElement={damageBubble.spellElement}
                                isCritical={damageBubble.isCritical}
                                isResisted={damageBubble.isResisted}
                                seq={damageBubble.seq}
                                delayMs={damageBubble.delayMs}
                            />
                        )}
                        {procBubblesForSlot.map((procBubble) => (
                            <RuneDamageBubble
                                key={procBubble.seq}
                                amount={procBubble.amount}
                                baseAmount={procBubble.baseAmount}
                                spellElement={procBubble.spellElement}
                                isCritical={procBubble.isCritical}
                                isResisted={procBubble.isResisted}
                                seq={procBubble.seq}
                                delayMs={procBubble.delayMs}
                                kind={procBubble.kind}
                            />
                        ))}
                    </div>
                );
            })}
        </div>
    );
}
