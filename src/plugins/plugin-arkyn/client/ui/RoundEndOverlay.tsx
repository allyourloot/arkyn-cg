import { useEffect, useMemo, useState } from "react";
import {
    useCurrentRound,
    useLastRoundGoldBase,
    useLastRoundGoldBossBonus,
    useLastRoundGoldHandsBonus,
    useLastRoundGoldHandsCount,
    useLastRoundGoldInterest,
    useLastRoundGoldSigilBonus,
    useSigils,
    sendCollectRoundGold,
    sendReady,
} from "../arkynStore";
import {
    SIGIL_DEFINITIONS,
    getEndOfRoundSigilGold,
    type EndOfRoundGoldEntry,
} from "../../shared";
import {
    playButton,
    playGold,
    playGoldTotal,
    playMenuOpen,
    playRoundWin,
    playTypewriter,
    stopTypewriter,
} from "../sfx";
import PanelFrame from "./PanelFrame";
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
const LINE_BOSS_TEXT = "Defeat Boss............";
const LINE_INTEREST_TEXT = "Interest...............";

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
    const currentRound = useCurrentRound();
    const baseGold = useLastRoundGoldBase();
    const handsBonus = useLastRoundGoldHandsBonus();
    const handsCount = useLastRoundGoldHandsCount();
    const sigilBonus = useLastRoundGoldSigilBonus();
    const bossBonus = useLastRoundGoldBossBonus();
    const interest = useLastRoundGoldInterest();
    const sigils = useSigils();
    const totalGold = baseGold + handsBonus + sigilBonus + bossBonus + interest;

    // Per-sigil end-of-round gold breakdown (Plunder et al.). Ordered by
    // the player's owned-sigils array so the reveal feels stable across
    // re-mounts. Memoized so the animation useEffect doesn't re-fire when
    // sigils identity changes but the relevant subset hasn't.
    const sigilEntries: EndOfRoundGoldEntry[] = useMemo(
        () => getEndOfRoundSigilGold(sigils).entries,
        [sigils],
    );
    // Baked text per sigil row, e.g. "Plunder........". Dot padding matches
    // the base/hands rows so the right edge lands in the same column.
    const sigilLines = useMemo(
        () => sigilEntries.map(entry => {
            const name = SIGIL_DEFINITIONS[entry.sigilId]?.name ?? entry.sigilId;
            return { sigilId: entry.sigilId, amount: entry.amount, text: `${name}........` };
        }),
        [sigilEntries],
    );
    // Memo key that changes only when the animated line set changes —
    // stable identity lets the animation useEffect's dep array compare
    // cheaply without re-running on unrelated sigil changes.
    const sigilLinesKey = useMemo(
        () => sigilLines.map(l => `${l.sigilId}:${l.amount}`).join("|"),
        [sigilLines],
    );

    // Animation reveal state. Each piece is independent so the rest of
    // the panel can already be on screen as later pieces type/pop in.
    const [line1Text, setLine1Text] = useState("");
    const [line1Coins, setLine1Coins] = useState(0);
    const [line2Text, setLine2Text] = useState("");
    const [line2Coins, setLine2Coins] = useState(0);
    // Optional rows — only typed/popped when their amount is > 0. Boss
    // bonus reveals between Enemy Defeated and Remaining Hands; interest
    // reveals between Remaining Hands and the sigil rows so the
    // "deterministic round-end income → conditional bonus" cadence reads
    // top-to-bottom.
    const [bossText, setBossText] = useState("");
    const [bossCoins, setBossCoins] = useState(0);
    const [interestText, setInterestText] = useState("");
    const [interestCoins, setInterestCoins] = useState(0);
    // Per-sigil rows — parallel arrays indexed by sigilLines position.
    // The typewriter writes into `sigilTexts[i]` and the coins populate
    // `sigilCoins[i]`, one row at a time.
    const [sigilTexts, setSigilTexts] = useState<string[]>([]);
    const [sigilCoins, setSigilCoins] = useState<number[]>([]);
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
        setBossText("");
        setBossCoins(0);
        setInterestText("");
        setInterestCoins(0);
        setSigilTexts(sigilLines.map(() => ""));
        setSigilCoins(sigilLines.map(() => 0));
        setShowTotal(false);
        setShowButton(false);

        // Index-based setters so the sequencer can address one sigil row
        // at a time without churning surrounding state. Used by typeText
        // and popCoins below exactly like the scalar setters for rows 1-2.
        const setSigilText = (idx: number) => (s: string) =>
            setSigilTexts(prev => {
                if (prev[idx] === s) return prev;
                const next = prev.slice();
                next[idx] = s;
                return next;
            });
        const setSigilCoinCount = (idx: number) => (n: number) =>
            setSigilCoins(prev => {
                if (prev[idx] === n) return prev;
                const next = prev.slice();
                next[idx] = n;
                return next;
            });

        (async () => {
            await wait(INTRO_DELAY_MS);
            await typeText(LINE_1_TEXT, setLine1Text);
            await wait(60);
            await popCoins(baseGold, setLine1Coins);
            // Boss bonus row — only revealed when the killed enemy was
            // a boss (server stamps `lastRoundGoldBossBonus > 0`). The
            // row stays unmounted on non-boss rounds so the breakdown
            // doesn't show empty placeholder lines.
            if (bossBonus > 0) {
                await wait(LINE_GAP_MS);
                if (cancelled) return;
                await typeText(LINE_BOSS_TEXT, setBossText);
                await wait(60);
                await popCoins(bossBonus, setBossCoins);
            }
            await wait(LINE_GAP_MS);
            await typeText(line2Full, setLine2Text);
            await wait(60);
            await popCoins(handsBonus, setLine2Coins);
            // Interest row — only revealed when the player had enough
            // gold banked at the killing blow to earn interest. Same
            // unmount-on-zero treatment as the boss row.
            if (interest > 0) {
                await wait(LINE_GAP_MS);
                if (cancelled) return;
                await typeText(LINE_INTEREST_TEXT, setInterestText);
                await wait(60);
                await popCoins(interest, setInterestCoins);
            }
            // Sigil rows — one per owned end-of-round-gold sigil. Same
            // typewriter → coin-pop cadence as the base/hands rows. Order
            // follows the owned-sigils array so reveals stay stable.
            for (let i = 0; i < sigilLines.length; i++) {
                if (cancelled) return;
                await wait(LINE_GAP_MS);
                await typeText(sigilLines[i].text, setSigilText(i));
                await wait(60);
                await popCoins(sigilLines[i].amount, setSigilCoinCount(i));
            }
            await wait(LINE_GAP_MS);
            if (cancelled) return;
            setShowTotal(true);
            // Heavier "total reveal" stinger — distinct from the per-coin
            // blip so the player feels the round-up moment.
            playGoldTotal();
            // Credit the staged round-win gold into the player's bank now
            // (not on Continue). The server-side guard only lands the
            // award when phase is still round_end, so a double-send from
            // a re-mount would be a no-op anyway.
            sendCollectRoundGold();
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
        // baseGold / handsBonus / bossBonus / interest / line2Full /
        // sigilLinesKey uniquely identify the reward breakdown —
        // re-running on change handles the (rare) case where the player
        // advances mid-animation and a new defeat lands before the
        // component fully unmounts.
    }, [baseGold, handsBonus, bossBonus, interest, line2Full, sigilLines, sigilLinesKey]);

    // The handler must be the only path that closes the overlay so an
    // accidental keypress mid-animation doesn't lose the reward.
    const handleContinue = () => {
        if (!showButton) return;
        playButton();
        sendReady();
    };

    return (
        <div className={styles.backdrop}>
            <PanelFrame className={styles.panel} styleVars={panelStyleVars}>
                <span className={styles.title}>Round {currentRound} Complete</span>

                {/* Inner content frame — wraps the reward breakdown
                    (Enemy Defeated, Remaining Hands, Total Earned) so
                    they sit inside an inner-frame.png 9-slice that
                    visually distinguishes them from the outer panel. */}
                <div className={styles.contentFrame}>
                    <div className={styles.rewards}>
                        {/* Row 1 — base reward for defeating the enemy.
                            `--coin-count` is the row's destination count
                            (not the live tween count) so the per-coin
                            overlap stays stable through the pop reveal. */}
                        <div className={styles.row}>
                            <span className={styles.label}>{line1Text}</span>
                            <div
                                className={styles.coins}
                                style={{ "--coin-count": baseGold } as React.CSSProperties}
                            >
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

                        {/* Boss-only — flat bonus for defeating a boss
                            enemy. Conditionally mounted so non-boss
                            rounds don't show an empty row. */}
                        {bossBonus > 0 && (
                            <div className={styles.row}>
                                <span className={styles.label}>{bossText}</span>
                                <div
                                    className={styles.coins}
                                    style={{ "--coin-count": bossBonus } as React.CSSProperties}
                                >
                                    {Array.from({ length: bossCoins }).map((_, i) => (
                                        <img
                                            key={`boss-${i}`}
                                            src={goldIconUrl}
                                            alt="Gold"
                                            className={styles.coin}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Row 2 — bonus reward for unspent hands */}
                        <div className={styles.row}>
                            <span className={styles.label}>{line2Text}</span>
                            <div
                                className={styles.coins}
                                style={{ "--coin-count": handsBonus } as React.CSSProperties}
                            >
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

                        {/* Interest — +1 gold per N gold banked at the
                            killing blow. Conditionally mounted so rounds
                            with an empty bank don't show an empty row. */}
                        {interest > 0 && (
                            <div className={styles.row}>
                                <span className={styles.label}>{interestText}</span>
                                <div
                                    className={styles.coins}
                                    style={{ "--coin-count": interest } as React.CSSProperties}
                                >
                                    {Array.from({ length: interestCoins }).map((_, i) => (
                                        <img
                                            key={`int-${i}`}
                                            src={goldIconUrl}
                                            alt="Gold"
                                            className={styles.coin}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* One row per owned end-of-round-gold sigil
                            (Plunder et al.). Reveals in order after the
                            Remaining Hands row — same typewriter + coin
                            pop cadence as the fixed rows above. */}
                        {sigilLines.map((line, i) => (
                            <div key={line.sigilId} className={styles.row}>
                                <span className={styles.label}>{sigilTexts[i] ?? ""}</span>
                                <div
                                    className={styles.coins}
                                    style={{ "--coin-count": line.amount } as React.CSSProperties}
                                >
                                    {Array.from({ length: sigilCoins[i] ?? 0 }).map((_, c) => (
                                        <img
                                            key={`s-${line.sigilId}-${c}`}
                                            src={goldIconUrl}
                                            alt="Gold"
                                            className={styles.coin}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
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
                    Collect
                </button>
            </PanelFrame>
        </div>
    );
}
