import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { gsap } from "gsap";
import {
    sendReady,
    sendBuyItem,
    sendRerollShop,
    useShopItems,
    useGold,
    useActiveDrag,
    usePendingPackRunes,
    usePendingCodexScrolls,
    usePendingAuguryRunes,
    usePendingAuguryTarots,
    usePackAnimating,
    useSigils,
    setPackAnimating,
    emitSigilPurchase,
    emitPackPurchase,
} from "../arkynStore";
import { MAX_SIGILS, REROLL_COST, PACK_DEFINITIONS, type PackType } from "../../shared";
import { SIGIL_DEFINITIONS } from "../../shared/sigils";
import { playButton, playBuy, playClick, playOpenPack } from "../sfx";
import { RARITY_COLORS, createPanelStyleVars } from "./styles";
import { getPackImageUrl } from "./packAssets";
import ItemScene from "./ItemScene";
import PanelFrame from "./PanelFrame";
import Tooltip from "./Tooltip";
import RunePackPicker from "./RunePackPicker";
import CodexPicker from "./CodexPicker";
import AuguryPicker from "./AuguryPicker";
import ShopDropZone from "./ShopDropZone";
import { renderDescription, SigilExplainer, SigilPenaltyLine, splitPenalty } from "./descriptionText";
import { HAS_HOVER } from "./utils/hasHover";
import { useShopItemDrag } from "./hooks/useShopItemDrag";
import type { ShopDragItemType } from "../arkynStore";
import goldIconUrl from "/assets/icons/gold-64x64.png?url";
import frameUrl from "/assets/ui/frame.png?url";
import innerFrameGreenUrl from "/assets/ui/inner-frame-green.png?url";
import buttonGreenUrl from "/assets/ui/button-green.png?url";
import buttonGreenHoverUrl from "/assets/ui/button-green-hover.png?url";
import buttonGreenDisabledUrl from "/assets/ui/button-green-disabled.png?url";
import nextRoundButtonUrl from "/assets/ui/buttons/next-round.png?url";
import rerollButtonUrl from "/assets/ui/buttons/reroll-button.png?url";
import styles from "./ShopScreen.module.css";

// Slide durations for the shop <-> picker content swap inside the
// center column. Kept snappy so the purchase → picker transition
// doesn't feel laggy.
const CONTENT_EXIT_S = 0.22;
const CONTENT_ENTER_S = 0.32;

const panelStyleVars = {
    ...createPanelStyleVars(),
    "--reroll-bg": `url(${rerollButtonUrl})`,
} as CSSProperties;
const buttonStyleVars = {
    "--btn-bg": `url(${buttonGreenUrl})`,
    "--btn-bg-hover": `url(${buttonGreenHoverUrl})`,
    "--btn-bg-disabled": `url(${buttonGreenDisabledUrl})`,
} as CSSProperties;
const continueButtonStyleVars = {
    "--continue-bg": `url(${nextRoundButtonUrl})`,
} as CSSProperties;
const cardStyleVars = {
    "--card-bg": `url(${frameUrl})`,
    "--buy-bg": `url(${innerFrameGreenUrl})`,
} as CSSProperties;

// Pack itemTypes are recognized in the Packs section. Any future pack
// added to PACK_DEFINITIONS automatically lands here without touching
// this file.
const PACK_ITEM_TYPES = new Set<string>(Object.keys(PACK_DEFINITIONS));

type ShopScreenProps = {
    ref?: React.Ref<HTMLDivElement>;
};

export default function ShopScreen({ ref }: ShopScreenProps = {}) {
    const shopItems = useShopItems();
    const gold = useGold();
    const pendingPackRunes = usePendingPackRunes();
    const pendingCodexScrolls = usePendingCodexScrolls();
    const pendingAuguryRunes = usePendingAuguryRunes();
    const pendingAuguryTarots = usePendingAuguryTarots();
    const packAnimating = usePackAnimating();
    const sigils = useSigils();
    const sigilBarFull = sigils.length >= MAX_SIGILS;
    const activeDrag = useActiveDrag();

    const panelRef = useRef<HTMLDivElement>(null);
    const shopContentRef = useRef<HTMLDivElement>(null);
    const pickerContentRef = useRef<HTMLDivElement>(null);
    const [selectedShopIndex, setSelectedShopIndex] = useState<number | null>(null);
    // Mobile-only: tap on a card opens its tooltip. Drag (pointer movement
    // past 6px / 150ms threshold) takes precedence and dismisses the
    // tooltip via resetting this state. Desktop never sets this — its
    // tooltip is hover-driven via CSS.
    const [mobileTooltipShopIndex, setMobileTooltipShopIndex] = useState<number | null>(null);

    // `renderedMode` lags the live picker state during exit animations so
    // React keeps the outgoing element mounted while GSAP slides it out.
    // Same pattern used by ArkynOverlay's shop <-> playing swap. The
    // picker is gated on `packAnimating` so it doesn't slide in mid
    // pack-fly+dissolve animation (the schema sync that populates
    // `pendingX` may arrive before the animation finishes).
    const hasPendingPicker =
        pendingPackRunes.length > 0 ||
        pendingCodexScrolls.length > 0 ||
        pendingAuguryRunes.length > 0 ||
        pendingAuguryTarots.length > 0;
    const showPicker = hasPendingPicker && !packAnimating;
    const [renderedMode, setRenderedMode] = useState<"shop" | "picker">(showPicker ? "picker" : "shop");
    // Tracks the last seen value of packAnimating so we can detect the
    // moment it flips from true → false. On that edge, the shop content
    // was hidden under the pack-fly fade for the entire fly + dissolve,
    // so animating it sliding out adds 0.22s of "empty shop reappears"
    // dead time before the picker reveals. Snap mode instead.
    const prevPackAnimating = useRef(packAnimating);

    // Latches the picker that's currently up so it stays rendered
    // through its wrapper-exit transition. Without this, the moment the
    // server clears `pendingAuguryRunes` (after AuguryPicker's apply
    // animation calls sendApplyTarot), the JSX cascade below would fall
    // through to `<RunePackPicker runes={[]} />` while `renderedMode` is
    // still "picker" — its action panel ("Choose one rune to add to
    // your pouch") would briefly pop in before the wrapper exit fades
    // the picker away. Latching the type means the original picker
    // keeps rendering (with its now-empty arrays — its bottom UI stays
    // locked invisible from its own exit timeline) until renderedMode
    // flips to "shop" and unmounts it cleanly.
    type PickerType = "augury" | "codex" | "rune-pack";
    const [activePickerType, setActivePickerType] = useState<PickerType | null>(() => {
        if (pendingAuguryRunes.length > 0) return "augury";
        if (pendingCodexScrolls.length > 0) return "codex";
        if (pendingPackRunes.length > 0) return "rune-pack";
        return null;
    });
    useEffect(() => {
        // Only LATCH when a pending array becomes non-empty. The
        // empty-everywhere case is the exit transition — leave the
        // type alone so the picker keeps rendering until renderedMode
        // unmounts it.
        if (pendingAuguryRunes.length > 0) setActivePickerType("augury");
        else if (pendingCodexScrolls.length > 0) setActivePickerType("codex");
        else if (pendingPackRunes.length > 0) setActivePickerType("rune-pack");
    }, [pendingAuguryRunes.length, pendingCodexScrolls.length, pendingPackRunes.length]);
    useEffect(() => {
        // Once the wrapper exit completes and renderedMode flips back
        // to "shop", the picker has fully unmounted — clear the latch
        // so the next pack purchase starts from a clean slate.
        if (renderedMode === "shop") setActivePickerType(null);
    }, [renderedMode]);

    useLayoutEffect(() => {
        const targetMode: "shop" | "picker" = showPicker ? "picker" : "shop";
        const wasPackAnimating = prevPackAnimating.current;
        prevPackAnimating.current = packAnimating;

        if (targetMode === renderedMode) return;

        // Skip the exit animation when transitioning out of a pack-fly
        // → the shop content was invisible for the whole fly + dissolve,
        // so sliding it out adds dead time. Snap to the new mode and
        // let the entrance useLayoutEffect play the picker slide-in.
        if (wasPackAnimating && !packAnimating && targetMode === "picker") {
            setRenderedMode(targetMode);
            return;
        }

        const outgoingRef = renderedMode === "shop" ? shopContentRef : pickerContentRef;
        const outgoing = outgoingRef.current;

        const tl = gsap.timeline({
            onComplete: () => setRenderedMode(targetMode),
        });
        if (outgoing) {
            tl.to(outgoing, {
                x: renderedMode === "shop" ? -140 : 140,
                opacity: 0,
                duration: CONTENT_EXIT_S,
                ease: "power2.in",
            });
        }
        return () => { tl.kill(); };
    }, [showPicker, renderedMode, packAnimating]);

    // Entrance animation — fires on the newly rendered content.
    useLayoutEffect(() => {
        const incomingRef = renderedMode === "shop" ? shopContentRef : pickerContentRef;
        const incoming = incomingRef.current;
        if (!incoming) return;
        gsap.fromTo(incoming,
            { x: renderedMode === "shop" ? -140 : 140, opacity: 0 },
            { x: 0, opacity: 1, duration: CONTENT_ENTER_S, ease: "power2.out", overwrite: "auto" },
        );
    }, [renderedMode]);

    // Per-card pop-in stagger — fires only on cards whose fingerprint
    // wasn't in the previous render's set, so the animation targets only
    // freshly-added items. Initial mount pops every card; reroll pops
    // only the items that actually rolled (sigils — packs are untouched
    // by reroll); purchases pop nothing (the new set is a subset of the
    // old). Each card carries `data-shop-index` so we can scope the
    // GSAP query to just the new ones rather than re-popping everything
    // visible whenever any subset changes.
    const prevShopFingerprintRef = useRef<Set<string>>(new Set());
    useLayoutEffect(() => {
        if (renderedMode !== "shop") return;
        const root = shopContentRef.current;
        if (!root) return;

        // Key by the schema index (stable across purchases) — NOT the
        // post-filter visible-list index, which shifts when an item is
        // bought. Without the schema index, surviving cards would all
        // get new keys after a purchase and re-pop.
        const visibleEntries = shopItems
            .map((i, idx) => ({ shopIndex: idx, itemType: i.itemType, element: i.element ?? "", purchased: i.purchased }))
            .filter(x => !x.purchased);
        const newSet = new Set(
            visibleEntries.map(x => `${x.shopIndex}:${x.itemType}:${x.element}`),
        );
        const prevSet = prevShopFingerprintRef.current;
        const newShopIndices = visibleEntries
            .filter(x => !prevSet.has(`${x.shopIndex}:${x.itemType}:${x.element}`))
            .map(x => x.shopIndex);
        prevShopFingerprintRef.current = newSet;

        if (newShopIndices.length === 0) return;

        // Pick out only the newly-added cards by their data attribute,
        // preserving document order (sorted indices map to L→R Items
        // then L→R Packs). Stagger ≥ duration makes the pop read as
        // sequential rather than a fan-out cascade.
        newShopIndices.sort((a, b) => a - b);
        const newCards: HTMLElement[] = [];
        for (const idx of newShopIndices) {
            const el = root.querySelector<HTMLElement>(`[data-shop-index="${idx}"]`);
            if (el) newCards.push(el);
        }
        if (newCards.length === 0) return;
        gsap.fromTo(newCards,
            { scale: 0.4, opacity: 0, y: 10 },
            {
                scale: 1, opacity: 1, y: 0,
                duration: 0.14,
                ease: "back.out(2.4)",
                stagger: 0.07,
                overwrite: "auto",
            },
        );
    }, [renderedMode, shopItems]);

    // Deselect when the user clicks outside the shop panel. Card onClick
    // handles in-panel selection changes via React state; this listener only
    // fires for genuinely-outside clicks. The mobile tap-tooltip dismisses
    // on the same outside-click path so a single rule covers both flows.
    useEffect(() => {
        if (selectedShopIndex === null && mobileTooltipShopIndex === null) return;
        const handleDocClick = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setSelectedShopIndex(null);
                setMobileTooltipShopIndex(null);
            }
        };
        document.addEventListener("click", handleDocClick);
        return () => document.removeEventListener("click", handleDocClick);
    }, [selectedShopIndex, mobileTooltipShopIndex]);

    // Clear selection / mobile tooltip if the targeted item is purchased
    // or leaves the shop, so stale UI doesn't linger.
    useEffect(() => {
        if (selectedShopIndex !== null) {
            const stillAvailable = shopItems[selectedShopIndex] && !shopItems[selectedShopIndex].purchased;
            if (!stillAvailable) setSelectedShopIndex(null);
        }
        if (mobileTooltipShopIndex !== null) {
            const stillAvailable = shopItems[mobileTooltipShopIndex] && !shopItems[mobileTooltipShopIndex].purchased;
            if (!stillAvailable) setMobileTooltipShopIndex(null);
        }
    }, [shopItems, selectedShopIndex, mobileTooltipShopIndex]);

    // Drag-engage dismisses any open mobile tooltip — without this the
    // tooltip stays semi-visible behind the dragging clone (the source
    // card has opacity 0.35 but its tooltip child inherits the same
    // dimmed view, which reads as a ghost UI element next to the drag).
    useEffect(() => {
        if (activeDrag) setMobileTooltipShopIndex(null);
    }, [activeDrag]);

    const handleContinue = () => {
        playButton();
        sendReady();
    };

    const handleBuyPack = (shopIndex: number, packId: PackType, e: React.MouseEvent) => {
        e.stopPropagation();
        const def = PACK_DEFINITIONS[packId];
        if (!def) return;
        const card = (e.currentTarget as HTMLElement).closest(`.${styles.itemCard}`);
        const canvas = card?.querySelector(`.${styles.sigilCanvas}`) as HTMLElement | null;
        const fromRect = canvas?.getBoundingClientRect() ?? new DOMRect(
            window.innerWidth / 2, window.innerHeight / 2, 0, 0,
        );
        runBuyPack(shopIndex, packId, fromRect);
        setSelectedShopIndex(null);
    };

    /**
     * Pack-buy dispatcher shared between desktop's BUY-button handler
     * (`handleBuyPack`) and the mobile drag-drop path (`onDrop` in the
     * `useShopItemDrag` setup below). Flips the pack-animating gate
     * BEFORE sending the buy so the schema-synced `pendingX` array
     * doesn't trigger an early picker mount; ArkynOverlay's pack-fly
     * timeline flips it back off on cleanup. SFX order is BUY chime
     * first (confirms the gold spend, mirrors sigil purchases) then
     * the open-pack "rip" as the pack flies in and dissolves —
     * sounds as one continuous "I bought this and it's opening" cue.
     */
    const runBuyPack = (shopIndex: number, packId: PackType, fromRect: DOMRect) => {
        const def = PACK_DEFINITIONS[packId];
        if (!def) return;
        setPackAnimating(true);
        emitPackPurchase({
            packId,
            imageUrl: getPackImageUrl(packId, 128),
            fromRect,
            naturalAspect: def.aspectRatio,
            dissolveElement: def.dissolveElement,
        });
        sendBuyItem(shopIndex);
        playBuy();
        playOpenPack();
    };

    /**
     * Mobile drag-to-purchase wiring. Hook is consumed unconditionally
     * (the consumer surface is just a callback ref) but its
     * `onCardPointerDown` only gets attached to the cards when
     * `HAS_HOVER === false`. Desktop keeps its tap-to-select-then-BUY
     * flow untouched.
     *
     * `onTap` toggles the mobile tooltip on the tapped card; `onDrop`
     * looks up the item by shopIndex (avoids stale closures over
     * `sigilItems` / `packItems` filters) and dispatches the right buy
     * event with the clone's release rect as the fly-in start point.
     */
    const { onCardPointerDown } = useShopItemDrag({
        onTap: (shopIndex) => {
            setMobileTooltipShopIndex(prev => prev === shopIndex ? null : shopIndex);
            playClick();
        },
        onDrop: (shopIndex, itemType, fromRect) => {
            const item = shopItems[shopIndex];
            if (!item) return;
            setMobileTooltipShopIndex(null);
            if (itemType === "sigil") {
                sendBuyItem(shopIndex);
                playBuy();
                emitSigilPurchase({ sigilId: item.element, fromRect });
            } else {
                runBuyPack(shopIndex, itemType as PackType, fromRect);
            }
        },
    });

    // Split items by section. Sigils → "Items" row. Pack types →
    // "Packs" row. Future Items-section additions (e.g. standalone
    // scrolls) will join the sigilItems filter.
    const sigilItems = shopItems
        .map((item, idx) => ({ ...item, shopIndex: idx }))
        .filter(item => item.itemType === "sigil" && !item.purchased);
    const packItems = shopItems
        .map((item, idx) => ({ ...item, shopIndex: idx }))
        .filter(item => PACK_ITEM_TYPES.has(item.itemType) && !item.purchased);

    return (
        <div ref={ref} className={styles.wrapper}>
        {renderedMode === "shop" && (
        <div ref={shopContentRef} className={styles.shopContent}>
        {/* Drop shadow under the shop panel — same frame.png chrome
            rendered dark + semi-transparent and offset straight down so
            only the bottom edge peeks out below the panel. Sibling of
            the panel (not ::before) so panel:hover-style stacking can't
            trap it on top of the panel's own background. */}
        <div
            className={styles.panelShadow}
            style={panelStyleVars}
            aria-hidden="true"
        />
        <PanelFrame ref={panelRef} className={styles.panel} styleVars={panelStyleVars}>
            {/* Items section (sigils today; future scrolls slot in here too). */}
            <span className={styles.sectionLabel}>Items</span>
            <div className={styles.sigilRow}>
                <button
                    type="button"
                    className={styles.rerollButton}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (gold < REROLL_COST) return;
                        sendRerollShop();
                        playBuy();
                        setSelectedShopIndex(null);
                    }}
                    disabled={gold < REROLL_COST}
                >
                    <span className={styles.rerollLabel}>Reroll</span>
                    <span className={styles.rerollCost}>
                        <img src={goldIconUrl} alt="Gold" className={styles.rerollCostIcon} />
                        <span className={styles.rerollCostValue}>{REROLL_COST}</span>
                    </span>
                </button>
            <div className={styles.section}>
                <div className={styles.itemGrid}>
                    {sigilItems.length > 0 ? sigilItems.map((item, i) => {
                        const def = SIGIL_DEFINITIONS[item.element];
                        if (!def) return null;
                        const canAfford = gold >= item.cost;
                        // Disable buying sigils when the bar is full — the
                        // server would reject the purchase anyway, and the
                        // flyer animation kicked off client-side looks
                        // broken when the sigil never actually arrives.
                        const canBuy = canAfford && !sigilBarFull;
                        const rarityColor = RARITY_COLORS[def.rarity] ?? "#b0b0b0";
                        const isSelected = selectedShopIndex === item.shopIndex;
                        const isMobileTooltip = mobileTooltipShopIndex === item.shopIndex;
                        // Tooltip flips side based on card position so it always
                        // extends outward (never overlapping neighbor cards).
                        const tooltipPlacement = i < sigilItems.length / 2 ? "left" : "right";

                        // Branch on hover capability:
                        //  Desktop: tap-to-select-then-tap-BUY (existing flow).
                        //  Mobile:  drag-to-purchase via useShopItemDrag; tap
                        //           opens the per-card tooltip overlay.
                        const cardEventHandlers = HAS_HOVER ? {
                            onClick: () => setSelectedShopIndex(prev => {
                                const next = prev === item.shopIndex ? null : item.shopIndex;
                                if (next !== null) playClick();
                                return next;
                            }),
                        } : {
                            onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
                                const card = e.currentTarget;
                                const canvas = card.querySelector(`.${styles.sigilCanvas}`) as HTMLElement | null;
                                const fromRect = canvas?.getBoundingClientRect() ?? card.getBoundingClientRect();
                                onCardPointerDown(e, item.shopIndex, "sigil", canBuy, fromRect);
                            },
                        };

                        return (
                            <div
                                key={item.shopIndex}
                                data-shop-index={item.shopIndex}
                                className={`${styles.itemCard} ${!canAfford ? styles.itemCardCantAfford : ""} ${isSelected ? styles.itemCardSelected : ""}`}
                                style={{ ...cardStyleVars } as CSSProperties}
                                {...cardEventHandlers}
                            >
                                <div className={styles.priceChip}>
                                    <img src={goldIconUrl} alt="Gold" className={styles.priceIcon} />
                                    <span className={styles.priceValue}>{item.cost}</span>
                                </div>
                                <div className={styles.cardImageWrap}>
                                    <ItemScene
                                        itemId={item.element}
                                        index={i}
                                        className={styles.sigilCanvas}
                                    />
                                    {HAS_HOVER && isSelected && (
                                        <button
                                            type="button"
                                            className={styles.buyButton}
                                            style={buttonStyleVars}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (!canBuy) return;
                                                sendBuyItem(item.shopIndex);
                                                playBuy();
                                                const card = (e.currentTarget as HTMLElement).closest(`.${styles.itemCard}`);
                                                const canvas = card?.querySelector(`.${styles.sigilCanvas}`) as HTMLElement | null;
                                                const fromRect = canvas?.getBoundingClientRect() ?? new DOMRect(
                                                    window.innerWidth / 2, window.innerHeight / 2, 0, 0,
                                                );
                                                emitSigilPurchase({ sigilId: item.element, fromRect });
                                                setSelectedShopIndex(null);
                                            }}
                                            disabled={!canBuy}
                                            title={sigilBarFull && canAfford ? "Sigil bar full — sell a sigil to make room" : undefined}
                                        >
                                            Buy
                                        </button>
                                    )}
                                </div>
                                <Tooltip
                                    placement={tooltipPlacement}
                                    arrow
                                    variant="framed"
                                    className={isMobileTooltip ? styles.tooltipForceShow : undefined}
                                >
                                    <span className={styles.tooltipName}>
                                        {def.name}
                                    </span>
                                    <div className={styles.tooltipDescWrap}>
                                        {(() => {
                                            const { main, penalty } = splitPenalty(def.description);
                                            return (
                                                <>
                                                    <span className={styles.tooltipDesc}>
                                                        {renderDescription(main)}
                                                    </span>
                                                    {penalty && <SigilPenaltyLine text={penalty} />}
                                                </>
                                            );
                                        })()}
                                        {def.explainer && (
                                            <SigilExplainer
                                                label={def.explainer.label}
                                                elements={def.explainer.elements}
                                            />
                                        )}
                                    </div>
                                    <span
                                        className={styles.tooltipRarity}
                                        style={{ backgroundColor: rarityColor }}
                                    >
                                        {def.rarity}
                                    </span>
                                </Tooltip>
                            </div>
                        );
                    }) : null}
                </div>
            </div>
            </div>

            {/* Packs section — Rune Packs, Codex Packs, Augury Packs, future packs. */}
            <span className={styles.sectionLabel}>Packs</span>
            <div className={`${styles.section} ${styles.consumablesSection}`}>
                <div className={styles.itemGrid}>
                    {packItems.map((item, i) => {
                        const packId = item.itemType as PackType;
                        const def = PACK_DEFINITIONS[packId];
                        if (!def) return null;
                        const canAfford = gold >= item.cost;
                        const isSelected = selectedShopIndex === item.shopIndex;
                        const isMobileTooltip = mobileTooltipShopIndex === item.shopIndex;
                        const tooltipPlacement = i < packItems.length / 2 ? "left" : "right";
                        const packImageUrl = getPackImageUrl(packId, 128);

                        const cardEventHandlers = HAS_HOVER ? {
                            onClick: () => setSelectedShopIndex(prev => {
                                const next = prev === item.shopIndex ? null : item.shopIndex;
                                if (next !== null) playClick();
                                return next;
                            }),
                        } : {
                            onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
                                const card = e.currentTarget;
                                const canvas = card.querySelector(`.${styles.sigilCanvas}`) as HTMLElement | null;
                                const fromRect = canvas?.getBoundingClientRect() ?? card.getBoundingClientRect();
                                onCardPointerDown(e, item.shopIndex, item.itemType as ShopDragItemType, canAfford, fromRect);
                            },
                        };

                        return (
                            <div
                                key={item.shopIndex}
                                data-shop-index={item.shopIndex}
                                className={`${styles.itemCard} ${!canAfford ? styles.itemCardCantAfford : ""} ${isSelected ? styles.itemCardSelected : ""}`}
                                style={{ ...cardStyleVars } as CSSProperties}
                                {...cardEventHandlers}
                            >
                                {/* Pack priceChip + buyButton are anchored INSIDE cardImageWrap
                                    so their percentage offsets resolve against the visible
                                    portrait-art bounds rather than the square canvas wrapper.
                                    `.packCardImageWrap` shrinks cardImageWrap to canvas size
                                    so the chip's `top: -15%` and BUY's `top: 115%` read off
                                    the art geometry. */}
                                <div className={`${styles.cardImageWrap} ${styles.packCardImageWrap}`}>
                                    <div className={`${styles.priceChip} ${styles.packPriceChip}`}>
                                        <img src={goldIconUrl} alt="Gold" className={styles.priceIcon} />
                                        <span className={styles.priceValue}>{item.cost}</span>
                                    </div>

                                    <ItemScene
                                        itemId={packId}
                                        index={sigilItems.length + i}
                                        imageUrl={packImageUrl}
                                        useFrame={false}
                                        aspectRatio={def.aspectRatio}
                                        displayScale={def.displayScale}
                                        className={`${styles.sigilCanvas} ${styles.packCanvas}`}
                                    />
                                    {HAS_HOVER && isSelected && (
                                        <button
                                            type="button"
                                            className={`${styles.buyButton} ${styles.packBuyButton}`}
                                            style={buttonStyleVars}
                                            onClick={(e) => {
                                                if (!canAfford) return;
                                                handleBuyPack(item.shopIndex, packId, e);
                                            }}
                                            disabled={!canAfford}
                                        >
                                            Buy
                                        </button>
                                    )}
                                </div>

                                <Tooltip
                                    placement={tooltipPlacement}
                                    arrow
                                    variant="framed"
                                    className={`${styles.packTooltip}${isMobileTooltip ? " " + styles.tooltipForceShow : ""}`}
                                >
                                    <span className={styles.tooltipName}>
                                        {def.name}
                                    </span>
                                    <div className={styles.tooltipDescWrap}>
                                        <span className={styles.tooltipDesc}>
                                            {def.description}
                                        </span>
                                    </div>
                                </Tooltip>
                            </div>
                        );
                    })}
                </div>
            </div>

        </PanelFrame>
        {/* Hard-edged drop shadow — same next-round.png chrome rendered
            dark + semi-transparent + offset, painted BEFORE the button
            in DOM so it sits behind without needing z-index gymnastics
            (the button's :hover transform creates a stacking context
            that would trap a ::before sibling on top of its own bg). */}
        <div
            className={`${styles.continueButton} ${styles.continueButtonShadow}`}
            style={continueButtonStyleVars}
            aria-hidden="true"
        >
            Next Round
        </div>
        <button
            type="button"
            onClick={handleContinue}
            className={styles.continueButton}
            style={continueButtonStyleVars}
        >
            Next Round
        </button>
        {/* Mobile drag-to-purchase: pack drop zone anchored to the
            shop panel's right edge (mirrors NEXT ROUND's `left: 100%`
            positioning) so it sits just outside the panel's right
            side, below the NEXT ROUND button. Self-gates on
            `useActiveDrag` for visibility and registers its DOM with
            the store so the drag hook can hit-test it. */}
        {!HAS_HOVER && <ShopDropZone kind="pack" />}
        </div>
        )}

        {renderedMode === "picker" && activePickerType !== null && (
            activePickerType === "augury"
                ? <AuguryPicker ref={pickerContentRef} runes={pendingAuguryRunes} tarotIds={pendingAuguryTarots} />
            : activePickerType === "codex"
                ? <CodexPicker ref={pickerContentRef} scrolls={pendingCodexScrolls} />
                : <RunePackPicker ref={pickerContentRef} runes={pendingPackRunes} />
        )}
        </div>
    );
}
