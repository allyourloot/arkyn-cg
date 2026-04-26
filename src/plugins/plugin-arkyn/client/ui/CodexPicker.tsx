import { useRef, useState, type CSSProperties, type Ref } from "react";
import {
    sendCodexChoice,
    emitScrollPurchase,
    useScrollLevels,
    useSigils,
} from "../arkynStore";
import { getScrollLevelsPerUse } from "../../shared";
import { playButton, playBuy, playSelectRune } from "../sfx";
import ItemScene from "./ItemScene";
import { getScrollImageUrl } from "./scrollAssets";
import { createPanelStyleVars } from "./styles";
import buttonGreenUrl from "/assets/ui/button-green.png?url";
import buttonGreenHoverUrl from "/assets/ui/button-green-hover.png?url";
import buttonGreenDisabledUrl from "/assets/ui/button-green-disabled.png?url";
import buttonOrangeUrl from "/assets/ui/button-orange.png?url";
import buttonOrangeHoverUrl from "/assets/ui/button-orange-hover.png?url";
import styles from "./CodexPicker.module.css";

const panelStyleVars = createPanelStyleVars();
const buttonVars = {
    "--btn-bg": `url(${buttonGreenUrl})`,
    "--btn-bg-hover": `url(${buttonGreenHoverUrl})`,
    "--btn-bg-disabled": `url(${buttonGreenDisabledUrl})`,
    "--skip-bg": `url(${buttonOrangeUrl})`,
    "--skip-bg-hover": `url(${buttonOrangeHoverUrl})`,
} as CSSProperties;

interface CodexPickerProps {
    scrolls: string[];
    ref?: Ref<HTMLDivElement>;
}

/**
 * Mid-shop modal that appears after the player buys a Codex Pack.
 *
 * Shows 4 distinct scroll element choices. Clicking one highlights it;
 * Select grants +N scroll level on the picked element (server applies
 * the math via handleCodexChoice). Skip discards the pack with no
 * scroll granted (no refund). The server clears `pendingCodexScrolls`
 * on either path, which drives the picker → shop slide via the parent's
 * schema-sync.
 */
export default function CodexPicker({ scrolls, ref }: CodexPickerProps) {
    const scrollLevels = useScrollLevels();
    const sigils = useSigils();
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const handleSelect = () => {
        if (selectedIndex === null) return;
        const element = scrolls[selectedIndex];
        const card = cardRefs.current[selectedIndex];
        if (element && card) {
            // Snapshot the card rect BEFORE firing sendCodexChoice — the
            // server response clears `pendingCodexScrolls` and unmounts
            // the picker on the next tick. Reusing the existing scroll
            // purchase event delegates the fly + shake + upgrade reveal
            // to the same code path that handles direct scroll buys.
            const fromRect = card.getBoundingClientRect();
            const currentLevel = scrollLevels.get(element) ?? 0;
            const levelsGained = getScrollLevelsPerUse(sigils);
            emitScrollPurchase({
                element,
                oldLevel: currentLevel + 1,
                newLevel: currentLevel + 1 + levelsGained,
                fromRect,
            });
        }
        sendCodexChoice(selectedIndex);
        playBuy();
    };

    const handleSkip = () => {
        sendCodexChoice(null);
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
                {scrolls.map((element, i) => {
                    const isSelected = selectedIndex === i;
                    const scrollUrl = getScrollImageUrl(element);
                    return (
                        <button
                            key={`${element}-${i}`}
                            ref={el => { cardRefs.current[i] = el; }}
                            type="button"
                            className={`${styles.card} ${isSelected ? styles.cardSelected : ""}`}
                            onClick={() => handleCardClick(i)}
                        >
                            <div
                                className={styles.scrollWrap}
                                style={{ animationDelay: `${-i * 0.32}s` } as CSSProperties}
                            >
                                <ItemScene
                                    itemId={element}
                                    index={i}
                                    imageUrl={scrollUrl}
                                    smoothIdle
                                    className={styles.scrollCanvas}
                                />
                            </div>
                        </button>
                    );
                })}
            </div>

            <div className={styles.actionPanel} style={{ ...panelStyleVars, ...buttonVars }}>
                <div className={styles.promptStrip}>
                    <span className={styles.prompt}>Choose one Scroll to upgrade</span>
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
