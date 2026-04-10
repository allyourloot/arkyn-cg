import { useEffect, useState } from "react";
import {
    useLastRoundGoldBase,
    useLastRoundGoldHandsBonus,
    useLastRoundGoldHandsCount,
    sendReady,
} from "../arkynStore";
import {
    playGold,
    playGoldTotal,
    playMenuOpen,
    playRoundWin,
    playTypewriter,
    stopTypewriter,
} from "../sfx";
import { createPanelStyleVars } from "./styles";
import goldIconUrl from "/assets/icons/gold-64x64.png?url";
import buttonGreenUrl from "/assets/ui/button-green.png?url";
import buttonGreenHoverUrl from "/assets/ui/button-green-hover.png?url";
import buttonGreenDisabledUrl from "/assets/ui/button-green-disabled.png?url";
import styles from "./RoundEndOverlay.module.css";

// Per-character delay for the typewriter reveal — fast but still legible.
const TYPE_INTERVAL_MS = 16;
// Stagger between coin pop-ins.
const COIN_INTERVAL_MS = 110;
// Pause between the end of one reward row and the start of the next.
const LINE_GAP_MS = 240;
// Initial pause before the animation kicks off.
const INTRO_DELAY_MS = 140;

const LINE_1_TEXT = "Enemy Defeated........";

// `createPanelStyleVars` already wires both `--panel-bg` (frame.png) and
// `--section-bg` (inner-frame.png), so the inner content frame can read
// the same variable the rest of the panel chrome uses.
const panelStyleVars = createPanelStyleVars();
const buttonStyleVars = {
    "--btn-bg": `url(${buttonGreenUrl})`,
    "--btn-bg-hover": `url(${buttonGreenHoverUrl})`,
    "--btn-bg-disabled": `url(${buttonGreenDisabledUrl})`,
} as React.CSSProperties;

/**
 * Round-end reward screen. Renders inside ArkynOverlay once the cast
 * animation has fully resolved (see ArkynOverlay's `showRoundEnd` gate).
 *
 * Reads the gold breakdown the server stamped onto the player at the
 * moment of the killing blow and types out the lines one character at a
 * time, popping coin icons in after each line lands. The total + Continue
 * button reveal at the end so the player has a clear "tap to advance"
 * affordance.
 */
export default function RoundEndOverlay() {
    const baseGold = useLastRoundGoldBase();
    const handsBonus = useLastRoundGoldHandsBonus();
    const handsCount = useLastRoundGoldHandsCount();
    const totalGold = baseGold + handsBonus;

    // Animation reveal state. Each piece is independent so the rest of
    // the panel can already be on screen as later pieces type/pop in.
    const [line1Text, setLine1Text] = useState("");
    const [line1Coins, setLine1Coins] = useState(0);
    const [line2Text, setLine2Text] = useState("");
    const [line2Coins, setLine2Coins] = useState(0);
    const [showTotal, setShowTotal] = useState(false);
    const [showButton, setShowButton] = useState(false);

    // The "Remaining Hands (N)" line is dynamic — bake the count in once
    // so the typewriter doesn't churn between renders mid-animation.
    const line2Full = `Remaining Hands (${handsCount})........`;

    // Fire the menu-open stinger exactly once when the overlay mounts.
    useEffect(() => {
        playMenuOpen();
        playRoundWin();
    }, []);

    useEffect(() => {
        // Animation sequencer. We use a cancellable timer chain instead of
        // GSAP here because the only thing we're animating is React state,
        // and the linear "type → pop coins → next line" cadence is much
        // easier to read as a flat async sequence than as a GSAP timeline.
        let cancelled = false;
        const timers: number[] = [];

        const wait = (ms: number) =>
            new Promise<void>((resolve) => {
                const id = window.setTimeout(() => resolve(), ms);
                timers.push(id);
            });

        const typeText = async (
            text: string,
            setter: (s: string) => void,
        ) => {
            // Restart the typewriter SFX from the beginning of the
            // sound so it ratchets in sync with each line. We stop it
            // explicitly when the line lands so the silence between
            // lines reads cleanly.
            playTypewriter();
            for (let i = 1; i <= text.length; i++) {
                if (cancelled) return;
                setter(text.slice(0, i));
                await wait(TYPE_INTERVAL_MS);
            }
            stopTypewriter();
        };

        const popCoins = async (
            count: number,
            setter: (n: number) => void,
        ) => {
            for (let i = 1; i <= count; i++) {
                if (cancelled) return;
                setter(i);
                // Pair every coin reveal with a coin pickup blip so the
                // animation lands in audio as well as visually.
                playGold();
                await wait(COIN_INTERVAL_MS);
            }
        };

        // Reset every reveal piece on (re)mount so an animation never
        // starts mid-state if React reuses the component instance.
        setLine1Text("");
        setLine1Coins(0);
        setLine2Text("");
        setLine2Coins(0);
        setShowTotal(false);
        setShowButton(false);

        (async () => {
            await wait(INTRO_DELAY_MS);
            await typeText(LINE_1_TEXT, setLine1Text);
            await wait(60);
            await popCoins(baseGold, setLine1Coins);
            await wait(LINE_GAP_MS);
            await typeText(line2Full, setLine2Text);
            await wait(60);
            await popCoins(handsBonus, setLine2Coins);
            await wait(LINE_GAP_MS);
            if (cancelled) return;
            setShowTotal(true);
            // Heavier "total reveal" stinger — distinct from the per-coin
            // blip so the player feels the round-up moment.
            playGoldTotal();
            await wait(360);
            if (cancelled) return;
            setShowButton(true);
        })();

        return () => {
            cancelled = true;
            for (const t of timers) window.clearTimeout(t);
            // Cut the typewriter sound if the overlay is torn down
            // mid-line (e.g. the player advances rounds before the
            // animation finishes).
            stopTypewriter();
        };
        // baseGold / handsBonus / line2Full uniquely identify the reward
        // breakdown — re-running on change handles the (rare) case where
        // the player advances mid-animation and a new defeat lands before
        // the component fully unmounts.
    }, [baseGold, handsBonus, line2Full]);

    // The handler must be the only path that closes the overlay so an
    // accidental keypress mid-animation doesn't lose the reward.
    const handleContinue = () => {
        if (!showButton) return;
        sendReady();
    };

    return (
        <div className={styles.backdrop}>
            <div className={styles.panel} style={panelStyleVars}>
                <span className={styles.title}>Round Complete</span>

                {/* Inner content frame — wraps the reward breakdown
                    (Enemy Defeated, Remaining Hands, Total Earned) so
                    they sit inside an inner-frame.png 9-slice that
                    visually distinguishes them from the outer panel. */}
                <div className={styles.contentFrame}>
                    <div className={styles.rewards}>
                        {/* Row 1 — base reward for defeating the enemy */}
                        <div className={styles.row}>
                            <span className={styles.label}>{line1Text}</span>
                            <div className={styles.coins}>
                                {Array.from({ length: line1Coins }).map((_, i) => (
                                    <img
                                        key={`l1-${i}`}
                                        src={goldIconUrl}
                                        alt="Gold"
                                        className={styles.coin}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Row 2 — bonus reward for unspent hands */}
                        <div className={styles.row}>
                            <span className={styles.label}>{line2Text}</span>
                            <div className={styles.coins}>
                                {Array.from({ length: line2Coins }).map((_, i) => (
                                    <img
                                        key={`l2-${i}`}
                                        src={goldIconUrl}
                                        alt="Gold"
                                        className={styles.coin}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Pixelated dashed divider between the breakdown
                        and the total. Always rendered so the layout
                        height is stable from frame one. */}
                    <div className={styles.divider} aria-hidden />

                    {/* The total row stays mounted so the panel holds
                        its final height through the type-out. Visibility
                        flips via a modifier class which drives a CSS
                        opacity/transform reveal. */}
                    <div
                        className={`${styles.totalRow} ${showTotal ? styles.totalRowVisible : ""}`}
                        aria-hidden={!showTotal}
                    >
                        <span className={styles.totalLabel}>Total Earned</span>
                        <img
                            src={goldIconUrl}
                            alt="Gold"
                            className={styles.totalCoin}
                        />
                        <span className={styles.totalAmount}>{totalGold}</span>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={handleContinue}
                    className={`${styles.button} ${showButton ? styles.buttonVisible : ""}`}
                    style={buttonStyleVars}
                    aria-hidden={!showButton}
                    tabIndex={showButton ? 0 : -1}
                >
                    Continue
                </button>
            </div>
        </div>
    );
}
