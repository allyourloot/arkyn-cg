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
                // A slot is "dimmed" when it has a played rune that *didn't*
                // contribute to the resolved spell — visually demoting the
                // wasted runes so the valid ones (which raise) stand out.
                const isDimmed = !!dissolving && !isRaised;

                const slotClasses = [styles.slot];
                if (isRaised) slotClasses.push(styles.raised);
                if (isDimmed) slotClasses.push(styles.dimmed);
                const slotClassName = slotClasses.join(" ");

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
                            <DissolveShader
                                rune={dissolving}
                                // Stagger each rune so they dissolve one after
                                // another for a more dramatic spell impact.
                                startTime={dissolveStartTime + i * DISSOLVE_STAGGER_MS}
                                duration={DISSOLVE_DURATION_MS}
                            />
                        )}
                        {damageBubble && (
                            <RuneDamageBubble
                                amount={damageBubble.amount}
                                spellElement={damageBubble.spellElement}
                                seq={damageBubble.seq}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}
