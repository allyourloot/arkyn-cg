import {
    useDissolvingRunes,
    useDissolveStartTime,
    useRaisedSlotIndices,
    useRuneDamageBubbles,
    DISSOLVE_DURATION_MS,
    DISSOLVE_STAGGER_MS,
} from "../arkynStore";
import { MAX_PLAY } from "../../shared";
import DissolveShader from "./DissolveShader";
import RuneDamageBubble from "./RuneDamageBubble";
import { getBaseRuneImageUrl } from "./runeAssets";
import styles from "./PlayArea.module.css";

export default function PlayArea() {
    const dissolvingRunes = useDissolvingRunes();
    const dissolveStartTime = useDissolveStartTime();
    const raisedSlotIndices = useRaisedSlotIndices();
    const runeDamageBubbles = useRuneDamageBubbles();

    // The empty slot uses the "common" base rune art with a desaturating
    // filter applied via CSS so it reads as a faded placeholder.
    const placeholderUrl = getBaseRuneImageUrl("common");

    return (
        <div className={styles.area}>
            {Array.from({ length: MAX_PLAY }, (_, i) => {
                const dissolving = dissolvingRunes[i];
                const isRaised = raisedSlotIndices.includes(i);
                const damageBubble = runeDamageBubbles[i] ?? null;

                const slotClassName = isRaised
                    ? `${styles.slot} ${styles.raised}`
                    : styles.slot;

                // When a bubble is present, wrap the dissolving rune in a
                // shake layer that replays its CSS keyframe animation each
                // time the bubble's `seq` changes. The same `delayMs` used
                // by the bubble drives the shake's animation-delay so the
                // rune shakes exactly when its number pops.
                const shakeStyle = damageBubble
                    ? { animationDelay: `${damageBubble.delayMs}ms` }
                    : undefined;
                const shakeClassName = damageBubble
                    ? `${styles.runeShake} ${styles.shaking}`
                    : styles.runeShake;

                return (
                    <div
                        key={i}
                        data-slot-index={i}
                        className={slotClassName}
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
                                className={shakeClassName}
                                style={shakeStyle}
                            >
                                <DissolveShader
                                    rune={dissolving}
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
                                spellElement={damageBubble.spellElement}
                                seq={damageBubble.seq}
                                delayMs={damageBubble.delayMs}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
