import { useRef, useState, type CSSProperties, type Ref } from "react";
import { sendBagChoice, emitBagRunePick, type RuneClientData } from "../arkynStore";
import { playButton, playBuy, playSelectRune } from "../sfx";
import RuneImage from "./RuneImage";
import { createPanelStyleVars } from "./styles";
import buttonGreenUrl from "/assets/ui/button-green.png?url";
import buttonGreenHoverUrl from "/assets/ui/button-green-hover.png?url";
import buttonGreenDisabledUrl from "/assets/ui/button-green-disabled.png?url";
import buttonOrangeUrl from "/assets/ui/button-orange.png?url";
import buttonOrangeHoverUrl from "/assets/ui/button-orange-hover.png?url";
import styles from "./RuneBagPicker.module.css";

// Wire `--panel-bg` (frame.png) + `--section-bg` (inner-frame.png) so the
// action panel and inner prompt strip use the standard 9-slice chrome.
const panelStyleVars = createPanelStyleVars();
const buttonVars = {
    "--btn-bg": `url(${buttonGreenUrl})`,
    "--btn-bg-hover": `url(${buttonGreenHoverUrl})`,
    "--btn-bg-disabled": `url(${buttonGreenDisabledUrl})`,
    "--skip-bg": `url(${buttonOrangeUrl})`,
    "--skip-bg-hover": `url(${buttonOrangeHoverUrl})`,
} as CSSProperties;

interface RuneBagPickerProps {
    runes: RuneClientData[];
    ref?: Ref<HTMLDivElement>;
}

/**
 * Mid-shop modal that appears after the player buys a Rune Bag.
 *
 * Shows 4 rune choices in a row. Clicking a rune highlights it; clicking
 * Select confirms the pick and permanently adds it to the player's pouch.
 * Skip discards the bag with no rune added (no refund). The server clears
 * `pendingBagRunes` on either path, which drives the picker → shop fade
 * via the parent's schema-sync.
 */
export default function RuneBagPicker({ runes, ref }: RuneBagPickerProps) {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const handleSelect = () => {
        if (selectedIndex === null) return;
        const rune = runes[selectedIndex];
        const card = cardRefs.current[selectedIndex];
        // Snapshot the card rect BEFORE firing sendBagChoice, since the
        // server response clears `pendingBagRunes` and unmounts the picker
        // on the next tick. The flying-rune overlay in ArkynOverlay uses
        // this rect as its launch position.
        if (rune && card) {
            emitBagRunePick({ rune, fromRect: card.getBoundingClientRect() });
        }
        sendBagChoice(selectedIndex);
        playBuy();
    };

    const handleSkip = () => {
        sendBagChoice(null);
        playButton();
    };

    const handleCardClick = (i: number) => {
        if (selectedIndex === i) return;
        setSelectedIndex(i);
        playSelectRune();
    };

    return (
        <div ref={ref} className={styles.wrapper}>
            <div className={styles.grid}>
                {runes.map((rune, i) => {
                    const isSelected = selectedIndex === i;
                    return (
                        <button
                            key={`${rune.id}-${i}`}
                            ref={el => { cardRefs.current[i] = el; }}
                            type="button"
                            className={`${styles.card} ${isSelected ? styles.cardSelected : ""}`}
                            onClick={() => handleCardClick(i)}
                        >
                            <div
                                className={styles.runeWrap}
                                style={{ animationDelay: `${-i * 0.32}s` } as CSSProperties}
                            >
                                <RuneImage
                                    rarity={rune.rarity}
                                    element={rune.element}
                                    className={styles.runeLayer}
                                />
                            </div>
                        </button>
                    );
                })}
            </div>

            <div className={styles.actionPanel} style={{ ...panelStyleVars, ...buttonVars }}>
                <div className={styles.promptStrip}>
                    <span className={styles.prompt}>Choose one rune to add to your pouch</span>
                </div>

                <div className={styles.buttonRow}>
                    <button
                        type="button"
                        className={styles.selectButton}
                        onClick={handleSelect}
                        disabled={selectedIndex === null}
                    >
                        Select
                    </button>
                    <button
                        type="button"
                        className={styles.skipButton}
                        onClick={handleSkip}
                    >
                        Skip
                    </button>
                </div>
            </div>
        </div>
    );
}
