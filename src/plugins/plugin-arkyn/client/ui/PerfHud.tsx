import { useEffect, useRef, useState } from "react";
import { getItemsRenderedLastFrame, getRegisteredItemCount } from "./sharedItemRenderer";
import styles from "./PerfHud.module.css";

// Dev-only perf overlay. Gated behind `?perf=1` at the call site so this
// never ships to players. Reads live counters from sharedItemRenderer;
// no mutation, no runtime cost when not mounted.

const FPS_SAMPLE_WINDOW = 30;   // frames averaged into the displayed FPS

export default function PerfHud() {
    const [display, setDisplay] = useState({ fps: 0, rendered: 0, registered: 0 });
    const rafRef = useRef(0);
    const lastTimeRef = useRef(0);
    const frameTimesRef = useRef<number[]>([]);

    useEffect(() => {
        lastTimeRef.current = performance.now();

        // Throttle React state updates to ~10Hz so we don't spin a
        // re-render every frame (which would itself perturb what we're
        // measuring). The rAF loop keeps sampling at full rate; React
        // just snapshots periodically.
        let nextUiUpdate = 0;

        const tick = (now: number) => {
            const dt = now - lastTimeRef.current;
            lastTimeRef.current = now;
            const times = frameTimesRef.current;
            times.push(dt);
            if (times.length > FPS_SAMPLE_WINDOW) times.shift();

            if (now >= nextUiUpdate) {
                nextUiUpdate = now + 100;
                const sum = times.reduce((a, b) => a + b, 0);
                const avg = sum / Math.max(times.length, 1);
                setDisplay({
                    fps: avg > 0 ? Math.round(1000 / avg) : 0,
                    rendered: getItemsRenderedLastFrame(),
                    registered: getRegisteredItemCount(),
                });
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, []);

    return (
        <div className={styles.hud} aria-hidden="true">
            <div>FPS <span className={styles.value}>{display.fps}</span></div>
            <div>Items <span className={styles.value}>{display.rendered}/{display.registered}</span></div>
        </div>
    );
}

// Cheap helper so call sites don't repeat the URL-param dance.
export function isPerfHudEnabled(): boolean {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("perf") === "1";
}
