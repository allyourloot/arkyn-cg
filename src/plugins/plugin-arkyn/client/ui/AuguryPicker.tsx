import { useEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
    DISSOLVE_DURATION_MS,
    arkynStoreInternal,
    sendApplyTarot,
    useAuguryPurchaseCount,
    useCurrentRound,
    useRunSeed,
    useSigils,
    type RuneClientData,
} from "../arkynStore";
import { notify } from "../arkynStoreCore";
import {
    ELEMENT_TYPES,
    SIGIL_DEFINITIONS,
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
import {
    playButton,
    playDissolve,
    playSelectRune,
    playDeselectRune,
    playDrawTarot,
    playSelectTarot,
    playDeselectTarot,
    playConvert,
    playGold,
} from "../sfx";
import ItemScene from "./ItemScene";
import RuneImage from "./RuneImage";
import Tooltip from "./Tooltip";
import DissolveCanvas from "./DissolveCanvas";
import { getBaseRuneImageUrl, getRuneImageUrl } from "./runeAssets";
import { getTarotImageUrl } from "./tarotAssets";
import { renderDescription } from "./descriptionText";
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
    ownedSigils: readonly string[],
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
        ownedSigils,
    });
}

// Derived once at module load — the highest maxTargets across all
// tarot definitions. Defines how many runes the player can pre-select
// before choosing a tarot.
const NO_TAROT_CAP_DEFAULT = Math.max(
    ...Object.values(TAROT_DEFINITIONS).map(d => d.maxTargets),
);

// Staggered "+N Gold" pop sequence over the gold counter for Tower's
// banishForGold. Mirrors the Fortune-style two-phase reveal used in
// the cast pipeline (bubble shows → counter ticks + SFX → bubble
// clears) and the gold-display lock pattern from arkynAnimations.ts
// (Banish sigil flow). One iteration per banished rune; the final
// timeout unlocks the gold display so any drift from the server's
// authoritative value is reconciled.
const TOWER_POP_INTERVAL_MS = 380;
const TOWER_POP_COMMIT_DELAY_MS = 180;
const TOWER_POP_CLEAR_DELAY_MS = 360;
function runTowerGoldPopSequence(banishedCount: number, goldPerRune: number): void {
    for (let i = 0; i < banishedCount; i++) {
        const popTime = i * TOWER_POP_INTERVAL_MS;
        setTimeout(() => {
            arkynStoreInternal.triggerGoldProcBubble(goldPerRune);
            notify();
        }, popTime);
        setTimeout(() => {
            playGold();
            arkynStoreInternal.addDisplayedGold(goldPerRune);
            notify();
        }, popTime + TOWER_POP_COMMIT_DELAY_MS);
        setTimeout(() => {
            arkynStoreInternal.clearGoldProcBubble();
            notify();
        }, popTime + TOWER_POP_CLEAR_DELAY_MS);
    }
    const totalDuration = (banishedCount - 1) * TOWER_POP_INTERVAL_MS + TOWER_POP_CLEAR_DELAY_MS + 100;
    setTimeout(() => {
        arkynStoreInternal.unlockGoldDisplayAndSyncToServer();
        notify();
    }, totalDuration);
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
// Reactive viewport check for the compact-picker layout. Mobile mode
// portals the action panel + tooltip to document.body and uses the
// alternate positioning rules in AuguryPicker.module.css; desktop
// keeps the action panel inside the wrapper at its original bottom-
// center spot. Reactive (matchMedia) so device rotation flips layout
// without a reload.
const COMPACT_PICKER_QUERY = "(max-height: 600px)";
function useIsCompactPicker(): boolean {
    const [matches, setMatches] = useState(() =>
        typeof window !== "undefined" &&
        window.matchMedia(COMPACT_PICKER_QUERY).matches
    );
    useEffect(() => {
        if (typeof window === "undefined") return;
        const mq = window.matchMedia(COMPACT_PICKER_QUERY);
        const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, []);
    return matches;
}

export default function AuguryPicker({ runes, tarotIds, ref }: AuguryPickerProps) {
    const isCompactPicker = useIsCompactPicker();
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
    const ownedSigils = useSigils();
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
    const tarotCardRefs = useRef<(HTMLButtonElement | null)[]>([]);

    // Dealt-hand entrance: each tarot card flies up from below with a
    // back-out ease and a per-card stagger, mirroring a dealer fanning
    // cards out. Each card fires `playDrawTarot` on its own onStart with
    // a slight ascending pitch step so the cascade reads as a rising
    // arpeggio. `clearProps: "transform,opacity"` returns control to CSS
    // so the hover/selected lift transitions still apply after the deal
    // lands. Iterates per-card instead of using `stagger.onStart` because
    // GSAP's `StaggerVars` type doesn't expose the per-tween callback.
    useGSAP(() => {
        const cards = tarotCardRefs.current.filter((c): c is HTMLButtonElement => !!c);
        if (cards.length === 0) return;
        const baseDelay = 0.1;
        const stagger = 0.11;
        const baseRate = 0.94;
        const rateStep = 0.03;
        cards.forEach((card, i) => {
            gsap.fromTo(
                card,
                { y: 60, opacity: 0, rotation: -8 },
                {
                    y: 0,
                    opacity: 1,
                    rotation: 0,
                    duration: 0.42,
                    ease: "back.out(1.4)",
                    delay: baseDelay + i * stagger,
                    clearProps: "transform,opacity",
                    onStart: () => playDrawTarot(baseRate + i * rateStep),
                },
            );
        });
    }, { dependencies: [] });

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
            playDeselectTarot();
            return;
        }
        setSelectedTarotIndex(i);
        setSelectedElement(null);
        playSelectTarot();

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
            ownedSigils,
        );

        setSlotAnims(anims);
        setSpawnedRunes(spawned);
        setIsApplying(true);
        setApplyStartTime(performance.now());

        // Per-rune apply SFX. Each fade slot (banish) → dissolve;
        // each flip slot routes by sub-effect — rarity-only flips
        // (upgradeRarity / wheel-upgrade) get a per-rune select pop;
        // element-change flips (convertElement / consecrate /
        // wheel-element-reroll) collapse to ONE convert SFX for the
        // whole event since stacking the convert sound per rune turns
        // an N-rune Lovers cast into a muddy double/triple thump.
        // Each spawned rune (add) → select. Pulse slots (duplicate
        // originals) don't play SFX themselves — the addition is
        // represented by the spawn next to them, so the spawn's SFX
        // covers the event.
        const applySfxCues: (() => void)[] = [];
        const convertIndices = new Set<number>();
        let convertQueued = false;
        for (const [pickerIndex, anim] of anims) {
            if (anim.kind === "fade") {
                applySfxCues.push(playDissolve);
            } else if (anim.kind === "flip") {
                const original = runes[pickerIndex];
                const isElementChange = !!original && original.element !== anim.newRune.element;
                if (isElementChange) {
                    convertIndices.add(pickerIndex);
                    if (!convertQueued) {
                        applySfxCues.push(playConvert);
                        convertQueued = true;
                    }
                } else {
                    applySfxCues.push(playSelectRune);
                }
            }
        }
        for (let i = 0; i < spawned.length; i++) applySfxCues.push(playSelectRune);

        // Tower's banish-for-gold needs a staggered "+N Gold" pop
        // sequence over the gold counter — one pop per banished rune,
        // with `playGold` per pop. We capture the per-rune amount here
        // because activeTarot is closed over but its narrowed type
        // isn't preserved into the deferred sendMessageOnce.
        const isBanishForGold = activeTarot.effect.type === "banishForGold";
        const banishGoldPerRune = activeTarot.effect.type === "banishForGold"
            ? activeTarot.effect.goldPerRune
            : 0;
        const banishedCount = sortedIndices.length;

        const sendMessageOnce = () => {
            // Lock displayed gold BEFORE the message goes out so the
            // server's schema patch can't snap the counter to its
            // post-Tower total before our staggered pops have a chance
            // to tick it up rune-by-rune. The pops below drive
            // displayedGold up via addDisplayedGold; the unlock at the
            // end syncs anything left over to the server's authoritative
            // value.
            if (isBanishForGold && banishedCount > 0) {
                arkynStoreInternal.lockGoldDisplay();
                notify();
            }
            sendApplyTarot({
                tarotId: activeTarot.id,
                runeIndices: sortedIndices,
                element: selectedElement ?? undefined,
            });
            if (isBanishForGold && banishedCount > 0) {
                runTowerGoldPopSequence(banishedCount, banishGoldPerRune);
            }
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

        // No per-slot anims AND no spawned runes (Judgement, Tower with
        // 0 picks etc.) — skip the apply animation but still play the
        // exit slide so the picker doesn't snap-cut back to the shop.
        // Fire a single confirmation SFX since there's no per-rune
        // visual to sync to.
        if (anims.size === 0 && spawned.length === 0) {
            playSelectRune();
            requestAnimationFrame(runExit);
            return;
        }

        // Wait one frame so the back-face DOM nodes (mounted only when
        // slotAnims has the slot) are present before GSAP grabs refs.
        requestAnimationFrame(() => {
            buildAuguryApplyTimeline(buildAnimationRefs(), {
                anims,
                spawned,
                convertIndices,
                applySfxCues,
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
        || activeTarot.effect.type === "gainGoldFromSigils"
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
                    const url = getTarotImageUrl(def.fileBasename);
                    // Live gold preview for Temperance — sum of owned sigil
                    // sellPrices times goldPerSellValue. Mirrors the
                    // server's `gainGoldFromSigils` mutate so the player
                    // sees the exact gold they'd receive on Apply.
                    let temperanceGold: number | null = null;
                    if (def.effect.type === "gainGoldFromSigils") {
                        let total = 0;
                        for (const id of ownedSigils) {
                            const sigilDef = SIGIL_DEFINITIONS[id];
                            if (sigilDef) total += sigilDef.sellPrice;
                        }
                        temperanceGold = total * def.effect.goldPerSellValue;
                    }
                    return (
                        <button
                            key={`${tarotId}-${i}`}
                            ref={el => { tarotCardRefs.current[i] = el; }}
                            type="button"
                            className={`${styles.tarotCard} ${isSelected ? styles.tarotCardSelected : ""}`}
                            onClick={() => handleTarotClick(i)}
                        >
                            {/* Tarot art rendered through the shared ItemScene
                                renderer (same WebGL context that drives sigils
                                + scrolls) so the cards get the glossy tilt
                                shader for free. `useFrame={false}` skips the
                                sigil-frame backdrop — tarot art is its own
                                full card. The mesh stays 1×1 (aspectRatio: 1)
                                and the wrapper's CSS aspect-ratio (92/162)
                                drives the buffer aspect, which keeps the
                                tarot proportions intact without the
                                square-slot empty margins that pack cards get. */}
                            <ItemScene
                                itemId={tarotId}
                                index={i}
                                imageUrl={url}
                                useFrame={false}
                                aspectRatio={1}
                                smoothIdle
                                className={styles.tarotCanvas}
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
                                    <span className={styles.tooltipDesc}>{renderDescription(def.description)}</span>
                                    {temperanceGold !== null && (
                                        <span className={styles.tooltipPreview}>
                                            Currently: <span style={{ color: "#fbbf24" }}>+{temperanceGold} Gold</span>
                                        </span>
                                    )}
                                </div>
                            </Tooltip>
                        </button>
                    );
                })}
            </div>

            {(() => {
                const actionPanelEl = (
                    <div ref={actionPanelRef} className={`${styles.actionPanel} ${isCompactPicker ? styles.actionPanelCompact : ""} ${bottomUIExited ? styles.exited : ""}`} style={{ ...panelStyleVars, ...buttonVars }}>
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
                );
                /* Portal the action panel to document.body on mobile so
                   `position: fixed` (used in the .actionPanelCompact rule)
                   anchors against the viewport — the picker wrapper carries
                   a residual GSAP transform from the shop↔picker swap, which
                   would otherwise scope `fixed` positioning to the picker
                   bounds and prevent the action panel from sitting in the
                   right gutter outside the picker. Desktop keeps the panel
                   inside the wrapper at its original absolute-positioned
                   bottom-center spot. */
                return isCompactPicker
                    ? createPortal(actionPanelEl, document.body)
                    : actionPanelEl;
            })()}

            {/* Mobile-only inline tarot info — rendered as a regular
                flex child of the wrapper so it inherits the picker's
                horizontal centering naturally (the wrapper is offset
                from viewport center because the left stats panel takes
                its share of the screen, and the picker's horizontal
                center sits ~25px right of viewport center on iPhone
                landscape — putting this box in-flow keeps it aligned
                with the tarot row above). Visible only on
                touch / compact viewports via the .mobileTarotInfo
                media rule in AuguryPicker.module.css; the per-card
                tooltip is hidden there so the content lives in
                exactly one place. */}
            {activeTarot && (() => {
                let temperanceGold: number | null = null;
                if (activeTarot.effect.type === "gainGoldFromSigils") {
                    let total = 0;
                    for (const id of ownedSigils) {
                        const sigilDef = SIGIL_DEFINITIONS[id];
                        if (sigilDef) total += sigilDef.sellPrice;
                    }
                    temperanceGold = total * activeTarot.effect.goldPerSellValue;
                }
                return (
                    <div className={`${styles.mobileTarotInfo} ${bottomUIExited ? styles.exited : ""}`}>
                        <span className={styles.mobileTarotInfoName}>{activeTarot.name}</span>
                        <div className={styles.mobileTarotInfoDescWrap}>
                            <span className={styles.mobileTarotInfoDesc}>
                                {renderDescription(activeTarot.description)}
                            </span>
                            {temperanceGold !== null && (
                                <span className={styles.mobileTarotInfoPreview}>
                                    Currently: <span style={{ color: "#fbbf24" }}>+{temperanceGold} Gold</span>
                                </span>
                            )}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
