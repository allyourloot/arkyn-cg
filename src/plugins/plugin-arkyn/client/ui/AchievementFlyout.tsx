import { useCallback, useEffect, useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { useAchievementFlyoutHead, type AchievementFlyoutData } from "../achievementsStore";
import { sendDismissAchievementFlyout } from "../arkynNetwork";
import { playAchievementUnlocked } from "../sfx";
import PanelFrame from "./PanelFrame";
import ItemScene from "./ItemScene";
import { createPanelStyleVars, INNER_FRAME_BGS } from "./styles";
import styles from "./AchievementFlyout.module.css";

const AUTO_DISMISS_MS = 5000;
const ENTER_S = 0.35;
const EXIT_S = 0.25;

const flyoutStyleVars = {
    ...createPanelStyleVars(),
    "--section-bg": INNER_FRAME_BGS.gold,
} as React.CSSProperties;

/**
 * Top-of-screen achievement-unlock flyout. Renders the head of
 * `pendingAchievementFlyouts`; remounts (via React `key`) when the head
 * changes so a queued chain plays one card at a time with a fresh
 * GSAP timeline.
 */
export default function AchievementFlyout() {
    const head = useAchievementFlyoutHead();
    if (!head) return null;
    return <FlyoutCard key={head.seq} data={head} />;
}

interface FlyoutCardProps {
    data: AchievementFlyoutData;
}

function FlyoutCard({ data }: FlyoutCardProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const dismissedRef = useRef(false);

    const dismiss = useCallback(() => {
        if (dismissedRef.current) return;
        dismissedRef.current = true;
        const node = rootRef.current;
        if (!node) {
            sendDismissAchievementFlyout(data.seq);
            return;
        }
        gsap.to(node, {
            y: -36,
            autoAlpha: 0,
            duration: EXIT_S,
            ease: "power2.in",
            onComplete: () => {
                sendDismissAchievementFlyout(data.seq);
            },
        });
    }, [data.seq]);

    useGSAP(
        () => {
            if (!rootRef.current) return;
            // Entry tween — slides down from above with a subtle scale.
            gsap.fromTo(
                rootRef.current,
                { autoAlpha: 0, y: -48, scale: 0.96 },
                { autoAlpha: 1, y: 0, scale: 1, duration: ENTER_S, ease: "back.out(1.4)" },
            );
        },
        { dependencies: [], scope: rootRef },
    );

    useEffect(() => {
        playAchievementUnlocked();
        const t = window.setTimeout(dismiss, AUTO_DISMISS_MS);
        return () => window.clearTimeout(t);
    }, [dismiss]);

    return (
        <div ref={rootRef} className={styles.root}>
            <PanelFrame styleVars={flyoutStyleVars} className={styles.card}>
                <div className={styles.body} onClick={dismiss}>
                    <span className={styles.heading}>Achievement Unlocked</span>
                    <span className={styles.name}>{data.name}</span>
                    <span className={styles.description}>{data.description}</span>
                    {data.unlocksSigilId && (
                        <span className={styles.unlockTag}>Sigil Unlocked</span>
                    )}
                </div>
                {data.unlocksSigilId && (
                    <div className={styles.sigilWrap}>
                        <ItemScene
                            itemId={data.unlocksSigilId}
                            index={0}
                            className={styles.sigilCanvas}
                            smoothIdle
                        />
                    </div>
                )}
            </PanelFrame>
        </div>
    );
}
