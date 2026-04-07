import {
    useDissolvingRunes,
    useDissolveStartTime,
    DISSOLVE_DURATION_MS,
    DISSOLVE_STAGGER_MS,
} from "../arkynStore";
import { MAX_PLAY } from "../../shared";
import DissolveShader from "./DissolveShader";
import styles from "./PlayArea.module.css";

export default function PlayArea() {
    const dissolvingRunes = useDissolvingRunes();
    const dissolveStartTime = useDissolveStartTime();

    return (
        <div className={styles.area}>
            {Array.from({ length: MAX_PLAY }, (_, i) => {
                const dissolving = dissolvingRunes[i];

                return (
                    <div
                        key={i}
                        data-slot-index={i}
                        className={`${styles.slot} ${dissolving ? "" : styles.empty}`}
                    >
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
