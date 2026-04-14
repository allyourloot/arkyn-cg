import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { useDisplayedGold, useGoldProcBubble } from "../arkynStore";
import goldIconUrl from "/assets/icons/gold-64x64.png?url";
import BouncyText from "./BouncyText";
import styles from "./GoldCounter.module.css";

/**
 * Persistent currency HUD. Lives at the bottom of the SpellPreview panel
 * inside its own inner-frame chrome (the parent panel supplies
 * `--section-bg` via createPanelStyleVars). Uses warm gold styling to
 * match `RoundInfo` / `PouchCounter`.
 *
 * During a cast the displayed value is frozen and ticked by the cast
 * timeline in sync with Fortune-style proc bubbles; the per-proc "+N
 * Gold" overlay pops over the counter a beat before the counter updates.
 */
export default function GoldCounter() {
    const gold = useDisplayedGold();
    const procBubble = useGoldProcBubble();

    // Pop the counter number whenever the displayed value changes. Skip
    // the very first render (so the initial mount doesn't pop).
    const countRef = useRef<HTMLSpanElement>(null);
    const prevGoldRef = useRef<number>(gold);
    useEffect(() => {
        if (prevGoldRef.current === gold) return;
        prevGoldRef.current = gold;
        const el = countRef.current;
        if (!el) return;
        gsap.fromTo(
            el,
            { scale: 1 },
            { scale: 1.25, duration: 0.12, ease: "back.out(2.5)", yoyo: true, repeat: 1 },
        );
    }, [gold]);

    return (
        <div className={styles.wrapper}>
            <img src={goldIconUrl} alt="Gold" className={styles.icon} />
            <span ref={countRef} className={styles.countPop}>
                <BouncyText className={styles.count}>{gold}</BouncyText>
            </span>
            {procBubble && (
                <GoldProcOverlay
                    amount={procBubble.amount}
                    seq={procBubble.seq}
                />
            )}
        </div>
    );
}

/**
 * Floating "+N Gold" overlay that pops over the counter when Fortune (or
 * any future gold-proc sigil) fires. Seq-keyed remount replays the
 * animation on back-to-back procs. Positioned absolutely inside the
 * wrapper so it floats above both the icon and the number.
 */
function GoldProcOverlay({ amount, seq }: { amount: number; seq: number }) {
    const overlayRef = useRef<HTMLSpanElement>(null);

    useGSAP(() => {
        const el = overlayRef.current;
        if (!el) return;
        gsap.set(el, { y: 4, scale: 0.55, opacity: 0 });
        const tl = gsap.timeline();
        tl.to(el, { y: -8, scale: 1.25, opacity: 1, duration: 0.13, ease: "back.out(2.5)" });
        tl.to(el, { y: -12, scale: 1, duration: 0.07, ease: "power2.out" });
        tl.to({}, { duration: 0.2 });
        tl.to(el, { y: -30, opacity: 0, duration: 0.35, ease: "power1.in" });
    }, { dependencies: [seq], scope: overlayRef });

    return (
        <span
            ref={overlayRef}
            key={seq}
            className={styles.procOverlay}
        >
            +{amount}
        </span>
    );
}
