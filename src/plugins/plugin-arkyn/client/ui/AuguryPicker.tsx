import { useMemo, useState, type CSSProperties, type Ref } from "react";
import {
    sendApplyTarot,
    type RuneClientData,
} from "../arkynStore";
import {
    ELEMENT_TYPES,
    TAROT_DEFINITIONS,
    type TarotDefinition,
    type ElementType,
} from "../../shared";
import { playButton, playBuy, playSelectRune, playDeselectRune } from "../sfx";
import RuneImage from "./RuneImage";
import Tooltip from "./Tooltip";
import { getRuneImageUrl } from "./runeAssets";
import { getTarotImageUrl } from "./tarotAssets";
import { createPanelStyleVars, ELEMENT_COLORS } from "./styles";
import buttonGreenUrl from "/assets/ui/button-green.png?url";
import buttonGreenHoverUrl from "/assets/ui/button-green-hover.png?url";
import buttonGreenDisabledUrl from "/assets/ui/button-green-disabled.png?url";
import buttonOrangeUrl from "/assets/ui/button-orange.png?url";
import buttonOrangeHoverUrl from "/assets/ui/button-orange-hover.png?url";
import styles from "./AuguryPicker.module.css";

const panelStyleVars = createPanelStyleVars();
const buttonVars = {
    "--btn-bg": `url(${buttonGreenUrl})`,
    "--btn-bg-hover": `url(${buttonGreenHoverUrl})`,
    "--btn-bg-disabled": `url(${buttonGreenDisabledUrl})`,
    "--skip-bg": `url(${buttonOrangeUrl})`,
    "--skip-bg-hover": `url(${buttonOrangeHoverUrl})`,
} as CSSProperties;

interface AuguryPickerProps {
    runes: RuneClientData[];
    tarotIds: string[];
    ref?: Ref<HTMLDivElement>;
}

/**
 * Mid-shop modal that appears after the player buys an Augury Pack.
 *
 * Layout (top → bottom):
 *   - Prompt heading
 *   - 8-rune horizontal overlapping row (mirroring the player's hand)
 *   - Optional element picker (shown when the active tarot's effect
 *     requires an element choice)
 *   - 5 tarot cards near the bottom
 *   - Action panel (Apply + Skip) anchored to the wrapper's bottom edge
 *
 * Apply enables when: a tarot is selected, the rune-pick count is in
 * range for the tarot, and (if applicable) an element has been chosen
 * and any per-tarot constraint (e.g. Strength's commonOrUncommonOnly)
 * is satisfied. The server clears the pending fields on Apply or Skip,
 * which drives the picker → shop slide via the parent's schema-sync.
 */
export default function AuguryPicker({ runes, tarotIds, ref }: AuguryPickerProps) {
    const [selectedTarotIndex, setSelectedTarotIndex] = useState<number | null>(null);
    const [selectedRuneIndices, setSelectedRuneIndices] = useState<Set<number>>(() => new Set());
    const [selectedElement, setSelectedElement] = useState<string | null>(null);

    const activeTarot: TarotDefinition | null = useMemo(() => {
        if (selectedTarotIndex === null) return null;
        const id = tarotIds[selectedTarotIndex];
        return id ? TAROT_DEFINITIONS[id] ?? null : null;
    }, [selectedTarotIndex, tarotIds]);

    // Resolve effective max-targets — clamp to the available pouch
    // sample so a tarot's `maxTargets: 3` never lets the player click
    // selections beyond the runes that exist in the picker.
    const effectiveMax = activeTarot ? Math.min(activeTarot.maxTargets, runes.length) : 0;
    const effectiveMin = activeTarot ? Math.min(activeTarot.minTargets, runes.length) : 0;

    const isApplyEnabled = useMemo(() => {
        if (!activeTarot) return false;
        const count = selectedRuneIndices.size;
        if (count < effectiveMin || count > effectiveMax) return false;
        if (activeTarot.requiresElement && !selectedElement) return false;
        if (activeTarot.targetConstraint === "commonOrUncommonOnly") {
            for (const idx of selectedRuneIndices) {
                const r = runes[idx];
                if (!r) return false;
                if (r.rarity !== "common" && r.rarity !== "uncommon") return false;
            }
        }
        return true;
    }, [activeTarot, selectedRuneIndices, effectiveMin, effectiveMax, selectedElement, runes]);

    // Universal cap when no tarot is selected — the highest maxTargets
    // across all tarots in the pool (Wheel of Fortune / Tower = 3). Lets
    // the player pre-select runes before deciding which tarot to apply.
    const NO_TAROT_CAP = 3;

    const handleTarotClick = (i: number) => {
        if (selectedTarotIndex === i) {
            // Click the active tarot again to deselect. Keep the rune
            // selection (player may want to apply a different tarot to
            // the same runes); clear only the element since each tarot
            // has its own element-pick semantics.
            setSelectedTarotIndex(null);
            setSelectedElement(null);
            playDeselectRune();
            return;
        }
        setSelectedTarotIndex(i);
        setSelectedElement(null);

        // If the new tarot is pouch-wide (Judgement, World), clear the
        // rune selection — the rune row hides and any held selection
        // would be silently ignored on Apply.
        // Otherwise, trim selection to the new tarot's max so Apply
        // gates predictably. Sets preserve insertion order in JS, so
        // trimming by iteration drops the most-recent picks.
        const newDef = TAROT_DEFINITIONS[tarotIds[i]] ?? null;
        const newMax = newDef ? Math.min(newDef.maxTargets, runes.length) : 0;
        if (newMax === 0) {
            setSelectedRuneIndices(new Set());
        } else {
            setSelectedRuneIndices(prev => {
                if (prev.size <= newMax) return prev;
                const trimmed = new Set<number>();
                let kept = 0;
                for (const idx of prev) {
                    if (kept++ >= newMax) break;
                    trimmed.add(idx);
                }
                return trimmed;
            });
        }

        playSelectRune();
    };

    const handleRuneClick = (i: number) => {
        // Cap defaults to the universal max when no tarot is active so
        // the player can build up a rune selection before deciding which
        // tarot to apply. Once a tarot is picked, the cap drops to its
        // effective max (clamped against `runes.length`).
        const cap = activeTarot ? effectiveMax : NO_TAROT_CAP;
        if (cap === 0) return;

        setSelectedRuneIndices(prev => {
            const next = new Set(prev);
            if (next.has(i)) {
                next.delete(i);
                playDeselectRune();
            } else {
                if (next.size >= cap) {
                    // At cap — ignore further additions instead of replacing
                    // a previous pick (player can deselect to free a slot).
                    return prev;
                }
                next.add(i);
                playSelectRune();
            }
            return next;
        });
    };

    const handleElementClick = (el: ElementType) => {
        if (!activeTarot?.requiresElement) return;
        setSelectedElement(prev => (prev === el ? prev : el));
        playSelectRune();
    };

    const handleApply = () => {
        if (!activeTarot || !isApplyEnabled) return;
        sendApplyTarot({
            tarotId: activeTarot.id,
            runeIndices: [...selectedRuneIndices].sort((a, b) => a - b),
            element: selectedElement ?? undefined,
        });
        playBuy();
    };

    const handleSkip = () => {
        sendApplyTarot({ tarotId: null });
        playButton();
    };

    // Prompt copy reflects current state so the player always knows what
    // to do next. Handles the four cases: nothing chosen yet, runes only,
    // tarot only, or both.
    const prompt = (() => {
        if (!activeTarot) {
            const n = selectedRuneIndices.size;
            if (n === 0) return "Choose a tarot card";
            return `${n} ${n === 1 ? "rune" : "runes"} selected. Choose a tarot card.`;
        }
        const count = selectedRuneIndices.size;
        if (effectiveMax === 0 && activeTarot.requiresElement) {
            return selectedElement ? `Element: ${selectedElement}` : "Pick an element";
        }
        if (effectiveMax === 0) return activeTarot.name;
        if (activeTarot.requiresElement && !selectedElement) {
            return `Pick an element (${count}/${effectiveMax} runes)`;
        }
        return `Selected ${count}/${effectiveMax} ${effectiveMax === 1 ? "rune" : "runes"}`;
    })();

    const showRuneRow = !activeTarot || effectiveMax > 0;

    return (
        <div ref={ref} className={styles.wrapper}>
            {showRuneRow && (
                <div className={styles.runeRow}>
                    <div className={styles.runeRail}>
                        {runes.map((rune, i) => {
                            const isSelected = selectedRuneIndices.has(i);
                            const dimmed =
                                activeTarot?.targetConstraint === "commonOrUncommonOnly" &&
                                rune.rarity !== "common" &&
                                rune.rarity !== "uncommon";
                            return (
                                <button
                                    key={`${rune.id}-${i}`}
                                    type="button"
                                    className={`${styles.runeSlot} ${isSelected ? styles.runeSlotSelected : ""} ${dimmed ? styles.runeSlotDimmed : ""}`}
                                    style={{ zIndex: isSelected ? 100 : i } as CSSProperties}
                                    onClick={() => handleRuneClick(i)}
                                    title={dimmed ? "This tarot only affects Common or Uncommon runes" : undefined}
                                >
                                    {/* Float animation lives on this inner wrapper so it
                                        doesn't compete with the selected-state lift on
                                        the outer .runeSlot — same split HandDisplay uses
                                        between .card (transform) and .floatWrap (bob). */}
                                    <div
                                        className={styles.runeFloat}
                                        style={{ animationDelay: `${-i * 0.32}s` } as CSSProperties}
                                    >
                                        <div className={styles.runeArt}>
                                            <RuneImage
                                                rarity={rune.rarity}
                                                element={rune.element}
                                                className={styles.runeLayer}
                                            />
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {activeTarot?.requiresElement && (
                <div className={styles.elementRow}>
                    {ELEMENT_TYPES.map(el => {
                        const isSelected = selectedElement === el;
                        const color = ELEMENT_COLORS[el] ?? "#b0b0b0";
                        return (
                            <button
                                key={el}
                                type="button"
                                className={`${styles.elementChip} ${isSelected ? styles.elementChipSelected : ""}`}
                                style={isSelected ? { boxShadow: `0 0 0 3px ${color}` } : undefined}
                                onClick={() => handleElementClick(el)}
                                title={el}
                            >
                                <img
                                    src={getRuneImageUrl(el)}
                                    alt={el}
                                    className={styles.elementChipImg}
                                    draggable={false}
                                />
                            </button>
                        );
                    })}
                </div>
            )}

            <div className={styles.tarotRow}>
                {tarotIds.map((tarotId, i) => {
                    const def = TAROT_DEFINITIONS[tarotId];
                    if (!def) return null;
                    const isSelected = selectedTarotIndex === i;
                    const url = getTarotImageUrl(def.fileBasename, "2x") || getTarotImageUrl(def.fileBasename, "1x");
                    return (
                        <button
                            key={`${tarotId}-${i}`}
                            type="button"
                            className={`${styles.tarotCard} ${isSelected ? styles.tarotCardSelected : ""}`}
                            onClick={() => handleTarotClick(i)}
                        >
                            <img
                                src={url}
                                alt={def.name}
                                className={styles.tarotImg}
                                draggable={false}
                            />
                            {/* Tarot row sits near the bottom of the picker, so
                                tooltips pop UP toward the rune row instead of
                                sideways (which would cover the neighboring
                                tarot cards).

                                The default Tooltip z-index (30) loses to
                                rune slots: selected runes carry z-index: 100
                                and hovered runes 90, both of which establish
                                their own stacking contexts in the same root
                                as the tooltip. Bump above those so the
                                tooltip always paints over the rune row. */}
                            <Tooltip placement="top" arrow variant="framed" style={{ zIndex: 1000 }}>
                                <span className={styles.tooltipName}>{def.name}</span>
                                <div className={styles.tooltipDescWrap}>
                                    <span className={styles.tooltipDesc}>{def.description}</span>
                                </div>
                            </Tooltip>
                        </button>
                    );
                })}
            </div>

            <div className={styles.actionPanel} style={{ ...panelStyleVars, ...buttonVars }}>
                <div className={styles.promptStrip}>
                    <span className={styles.prompt}>{prompt}</span>
                </div>

                <div className={styles.buttonRow}>
                    <button
                        type="button"
                        className={styles.selectButton}
                        onClick={handleApply}
                        disabled={!isApplyEnabled}
                    >
                        Apply
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
