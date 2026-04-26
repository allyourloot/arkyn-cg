import { useMemo, useRef, useState, type CSSProperties, type Ref } from "react";
import {
    DISSOLVE_DURATION_MS,
    sendApplyTarot,
    useAuguryPurchaseCount,
    useCurrentRound,
    useRunSeed,
    type RuneClientData,
} from "../arkynStore";
import {
    ELEMENT_TYPES,
    TAROT_DEFINITIONS,
    createRoundRng,
    getAuguryApplySeed,
    previewTarotEffect,
    type TarotDefinition,
    type ElementType,
    type PickedRune,
    type SlotPreviewKind,
} from "../../shared";
import {
    buildAuguryApplyTimeline,
    buildAuguryExitTimeline,
    type AuguryAnimationRefs,
} from "../animations/auguryTimelines";
import { playButton, playBuy, playSelectRune, playDeselectRune } from "../sfx";
import RuneImage from "./RuneImage";
import Tooltip from "./Tooltip";
import DissolveCanvas from "./DissolveCanvas";
import { getBaseRuneImageUrl, getRuneImageUrl } from "./runeAssets";
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
 * Per-rune-slot animation kind played when Apply is clicked. Re-export
 * of the shared registry's `SlotPreviewKind` (kept under the old
 * `SlotAnim` name locally so the JSX + GSAP timeline below read
 * naturally). The registry computes these from the chosen tarot's
 * effect + player picks; see `previewTarotEffect`.
 */
type SlotAnim = SlotPreviewKind;

let auguryPreviewIdSeq = 0;
function makePreviewId(): string {
    return `augury-preview-${++auguryPreviewIdSeq}`;
}

/**
 * Pure: derive the picker preview (per-slot animations + spawned runes)
 * by delegating to the shared `previewTarotEffect` registry. The same
 * registry's `mutate` runs on the server inside `handleApplyTarot`, so
 * server commits and client previews stay byte-for-byte aligned (the
 * RNG seed comes from `getAuguryApplySeed`, which both sides call).
 */
function computePreview(
    tarot: TarotDefinition,
    runes: RuneClientData[],
    pickedIndices: number[],
    chosenElement: string | null,
    runSeed: number,
    currentRound: number,
    auguryPurchaseCount: number,
) {
    const rng = createRoundRng(runSeed, getAuguryApplySeed(currentRound, auguryPurchaseCount));
    const picked: PickedRune[] = [];
    for (const idx of pickedIndices) {
        const r = runes[idx];
        if (!r) continue;
        picked.push({ rune: r, pickerIndex: idx });
    }
    return previewTarotEffect(tarot.effect, {
        picked,
        chosenElement: chosenElement ?? "",
        livePouch: [],   // unused on the client preview path (Judgement has no spawn)
        rng,
        nextId: makePreviewId,
    });
}

// Derived once at module load — the highest maxTargets across all
// tarot definitions. Defines how many runes the player can pre-select
// before choosing a tarot.
const NO_TAROT_CAP_DEFAULT = Math.max(
    ...Object.values(TAROT_DEFINITIONS).map(d => d.maxTargets),
);

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
    // Per-slot animation map populated when Apply is clicked. Drives
    // both the React-rendered back-face (for flips) and the GSAP
    // timeline that runs from the same effect; cleared once the message
    // sends and the picker is about to unmount via schema sync.
    const [slotAnims, setSlotAnims] = useState<Map<number, SlotAnim>>(() => new Map());
    const [isApplying, setIsApplying] = useState(false);
    // Flipped on after the apply animation finishes so the still-raised
    // selected slots drop their `runeSlotSelected` class — that triggers
    // the slot's CSS transform transition, easing the lift + glow back
    // into the row before the fly to the pouch begins. Kept separate
    // from `selectedRuneIndices` so the action panel's prompt text
    // (which counts selections) stays stable while the panel slides
    // off-screen.
    const [loweredForExit, setLoweredForExit] = useState(false);
    // Flipped on at the tail of the bottom-UI slide so the tarot row /
    // element row / action panel get a CSS-class lock (visibility +
    // pointer-events) on top of GSAP's inline opacity:0. Without this,
    // when the schema-sync clears `pendingAuguryTarots` after the apply
    // exit, AuguryPicker re-renders with `tarotIds=[]` (the tarot row
    // empties out) which triggers a layout reflow on the parent flex
    // wrapper. The reflow recomputes the action panel's natural width,
    // and because GSAP serialized the centering `translateX(-50%)`
    // baseline into a pixel value at slide-start, the panel briefly
    // pops back into view before the ShopScreen wrapper exit fades
    // it away with the picker. The visibility lock kicks in 1 frame
    // after the slide finishes so the slide visual itself is intact.
    const [bottomUIExited, setBottomUIExited] = useState(false);
    // Shared timestamp captured at Apply-click time; every fade-anim
    // slot's DissolveCanvas reads this so the dissolves all start in
    // lockstep instead of each picking its own performance.now() at
    // mount time.
    const [applyStartTime, setApplyStartTime] = useState<number | null>(null);
    // Runes that should APPEAR in the rune row at Apply time (The World
    // adds 1, The Lovers fuses 2 into 1). Rendered as additional slots
    // appended to the right of the picker runes with a reverse-dissolve
    // materialize.
    const [spawnedRunes, setSpawnedRunes] = useState<RuneClientData[]>([]);

    // Run-scoped state needed to mirror the server's apply-time RNG so
    // The World's preview rune matches what the server will actually
    // push to `acquiredRunes`. See `computePreview`.
    const runSeed = useRunSeed();
    const currentRound = useCurrentRound();
    const auguryPurchaseCount = useAuguryPurchaseCount();
    // Refs to the rune-slot buttons + their inner flipper divs. The
    // flipper carries the GSAP rotateY / scale / opacity transforms so
    // the outer button's CSS lift (translateY on selected) isn't
    // overwritten — same `.card` / `.floatWrap` split HandDisplay uses.
    const slotRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const flipperRefs = useRef<(HTMLDivElement | null)[]>([]);
    // Refs to the spawned-rune slot wrappers and the exit-target panels.
    // The exit choreography (fly to pouch + bottom-UI slide-down) needs
    // a handle to each so it can compute screen-space deltas and tween
    // them into oblivion before the apply message sends.
    const spawnRefs = useRef<(HTMLDivElement | null)[]>([]);
    const tarotRowRef = useRef<HTMLDivElement>(null);
    const elementRowRef = useRef<HTMLDivElement>(null);
    const actionPanelRef = useRef<HTMLDivElement>(null);

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
    // across all tarots in the pool (Wheel of Fortune / Tower = 3 today).
    // Lets the player pre-select runes before deciding which tarot to
    // apply. Derived from `TAROT_DEFINITIONS` so adding a higher-cap
    // tarot raises the cap automatically.
    const NO_TAROT_CAP = NO_TAROT_CAP_DEFAULT;

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

    /**
     * Build the apply + exit timeline refs from the current ref arrays.
     * Snapshotted at click time (inside handleApply) so the timeline
     * factory operates on a stable ref set for the duration of the
     * animation, even if the picker re-renders.
     */
    const buildAnimationRefs = (): AuguryAnimationRefs => ({
        slots: slotRefs.current,
        flippers: flipperRefs.current,
        spawns: spawnRefs.current,
        tarotRow: tarotRowRef.current,
        elementRow: elementRowRef.current,
        actionPanel: actionPanelRef.current,
    });

    const handleApply = () => {
        if (!activeTarot || !isApplyEnabled || isApplying) return;

        const sortedIndices = [...selectedRuneIndices].sort((a, b) => a - b);
        const { slotAnims: anims, spawnedRunes: spawned } = computePreview(
            activeTarot,
            runes,
            sortedIndices,
            selectedElement,
            runSeed,
            currentRound,
            auguryPurchaseCount,
        );

        setSlotAnims(anims);
        setSpawnedRunes(spawned);
        setIsApplying(true);
        setApplyStartTime(performance.now());
        playBuy();

        const sendMessageOnce = () => {
            sendApplyTarot({
                tarotId: activeTarot.id,
                runeIndices: sortedIndices,
                element: selectedElement ?? undefined,
            });
        };

        const runExit = () => {
            buildAuguryExitTimeline(buildAnimationRefs(), {
                anims,
                spawned,
                runeCount: runes.length,
                onBottomUIExited: () => setBottomUIExited(true),
                onComplete: sendMessageOnce,
            });
        };

        // No per-slot anims AND no spawned runes (Judgement) — skip
        // the apply animation but still play the exit slide so the
        // picker doesn't snap-cut back to the shop.
        if (anims.size === 0 && spawned.length === 0) {
            requestAnimationFrame(runExit);
            return;
        }

        // Wait one frame so the back-face DOM nodes (mounted only when
        // slotAnims has the slot) are present before GSAP grabs refs.
        requestAnimationFrame(() => {
            buildAuguryApplyTimeline(buildAnimationRefs(), {
                anims,
                spawned,
                onLowerForExit: () => setLoweredForExit(true),
                onComplete: runExit,
            });
        });
    };

    const handleSkip = () => {
        if (isApplying) return;
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

    // Show the rune row whenever the active tarot interacts with picker
    // runes (effectiveMax > 0), OR when it's The World — the row stays
    // visible so the spawned rune materializes into the row at Apply
    // time. Pouch-wide tarots without a spawn (Judgement) hide it as
    // before since there's nothing to display per-slot.
    const showRuneRow =
        !activeTarot
        || effectiveMax > 0
        || activeTarot.effect.type === "addRandomRune"
        || (isApplying && spawnedRunes.length > 0);

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
                                    ref={el => { slotRefs.current[i] = el; }}
                                    type="button"
                                    className={`${styles.runeSlot} ${isSelected && !loweredForExit ? styles.runeSlotSelected : ""} ${dimmed ? styles.runeSlotDimmed : ""}`}
                                    style={{ zIndex: isSelected ? 100 : i } as CSSProperties}
                                    onClick={() => handleRuneClick(i)}
                                    disabled={isApplying}
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
                                        {/* Flipper carries the GSAP transform during
                                            apply (rotateY for convert/upgrade, opacity
                                            for banish, scale for duplicate). Two faces
                                            with backface-visibility: hidden produce a
                                            clean card-flip — front is the current rune,
                                            back is the predicted post-apply rune
                                            (mounted only when the slot has a flip
                                            animation queued). */}
                                        <div
                                            ref={el => { flipperRefs.current[i] = el; }}
                                            className={styles.flipper}
                                        >
                                            <div className={styles.faceFront}>
                                                {(() => {
                                                    // Fade slots replace the static rune
                                                    // composite with a DissolveCanvas — the
                                                    // same shader the cast pipeline uses to
                                                    // tear played runes apart, registered
                                                    // through the shared dissolve renderer.
                                                    const anim = slotAnims.get(i);
                                                    if (anim?.kind === "fade" && applyStartTime !== null) {
                                                        return (
                                                            <DissolveCanvas
                                                                element={rune.element}
                                                                startTime={applyStartTime}
                                                                duration={DISSOLVE_DURATION_MS}
                                                                rune={{
                                                                    baseUrl: getBaseRuneImageUrl(rune.rarity),
                                                                    runeUrl: getRuneImageUrl(rune.element),
                                                                }}
                                                                className={styles.dissolveLayer}
                                                            />
                                                        );
                                                    }
                                                    return (
                                                        <div className={styles.runeArt}>
                                                            <RuneImage
                                                                rarity={rune.rarity}
                                                                element={rune.element}
                                                                className={styles.runeLayer}
                                                            />
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                            {(() => {
                                                const anim = slotAnims.get(i);
                                                if (anim?.kind !== "flip") return null;
                                                return (
                                                    <div className={styles.faceBack}>
                                                        <div className={styles.runeArt}>
                                                            <RuneImage
                                                                rarity={anim.newRune.rarity}
                                                                element={anim.newRune.element}
                                                                className={styles.runeLayer}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                        {/* Spawn slots — appended to the right of the picker
                            runes for tarots that ADD a rune to the deck (The
                            World, The Lovers). Each rune materializes via the
                            shared dissolve renderer in reverse mode (same
                            shader Magic Mirror uses for its proc). The slot
                            uses the same .runeSlot class so the row's overlap
                            layout absorbs it cleanly. */}
                        {spawnedRunes.map((rune, i) => (
                            <div
                                key={`spawn-${i}`}
                                ref={el => { spawnRefs.current[i] = el; }}
                                className={`${styles.runeSlot} ${styles.spawnSlot}`}
                                style={{ zIndex: 80 + i } as CSSProperties}
                            >
                                <div className={styles.runeFloat}>
                                    <div className={styles.runeArt}>
                                        {applyStartTime !== null ? (
                                            <DissolveCanvas
                                                element={rune.element}
                                                startTime={applyStartTime}
                                                duration={DISSOLVE_DURATION_MS}
                                                reverse
                                                rune={{
                                                    baseUrl: getBaseRuneImageUrl(rune.rarity),
                                                    runeUrl: getRuneImageUrl(rune.element),
                                                }}
                                                className={styles.dissolveLayer}
                                            />
                                        ) : (
                                            <RuneImage
                                                rarity={rune.rarity}
                                                element={rune.element}
                                                className={styles.runeLayer}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTarot?.requiresElement && (
                <div ref={elementRowRef} className={`${styles.elementRow} ${bottomUIExited ? styles.exited : ""}`}>
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

            <div ref={tarotRowRef} className={`${styles.tarotRow} ${bottomUIExited ? styles.exited : ""}`}>
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

            <div ref={actionPanelRef} className={`${styles.actionPanel} ${bottomUIExited ? styles.exited : ""}`} style={{ ...panelStyleVars, ...buttonVars }}>
                <div className={styles.promptStrip}>
                    <span className={styles.prompt}>{prompt}</span>
                </div>

                <div className={styles.buttonRow}>
                    <button
                        type="button"
                        className={styles.selectButton}
                        onClick={handleApply}
                        disabled={!isApplyEnabled || isApplying}
                    >
                        Apply
                    </button>
                    <button
                        type="button"
                        className={styles.skipButton}
                        onClick={handleSkip}
                        disabled={isApplying}
                    >
                        Skip
                    </button>
                </div>
            </div>
        </div>
    );
}
