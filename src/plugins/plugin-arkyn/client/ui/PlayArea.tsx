import {
    useDissolvingRunes,
    useDissolveStartTime,
    DISSOLVE_DURATION_MS,
    DISSOLVE_STAGGER_MS,
} from "../arkynStore";
import { MAX_PLAY } from "../../shared";
import DissolveShader from "./DissolveShader";
import { getBaseRuneImageUrl } from "./runeAssets";
import styles from "./PlayArea.module.css";

export default function PlayArea() {
    const dissolvingRunes = useDissolvingRunes();
    const dissolveStartTime = useDissolveStartTime();

    // The empty slot uses the "common" base rune art with a desaturating
    // filter applied via CSS so it reads as a faded placeholder.
    const placeholderUrl = getBaseRuneImageUrl("common");

    return (
        <div className={styles.area}>
            {Array.from({ length: MAX_PLAY }, (_, i) => {
                const dissolving = dissolvingRunes[i];
                const isEmpty = !dissolving;

                return (
                    <div
                        key={i}
                        data-slot-index={i}
                        className={styles.slot}
                    >
                        {isEmpty && placeholderUrl && (
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
                    </div>
                );
            })}
        </div>
    );
}
