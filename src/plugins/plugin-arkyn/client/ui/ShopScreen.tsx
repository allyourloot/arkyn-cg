import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { gsap } from "gsap";
import {
    sendReady,
    sendBuyItem,
    sendRerollShop,
    useShopItems,
    useGold,
    useScrollLevels,
    usePendingBagRunes,
    useSigils,
    emitScrollPurchase,
    emitSigilPurchase,
} from "../arkynStore";
import { MAX_SIGILS, REROLL_COST, getScrollLevelsPerUse } from "../../shared";
import { SIGIL_DEFINITIONS } from "../../shared/sigils";
import { playButton, playBuy } from "../sfx";
import { ELEMENT_COLORS, RARITY_COLORS, createPanelStyleVars } from "./styles";
import { getScrollImageUrl } from "./scrollAssets";
import { getRuneBagImageUrl } from "./bagAssets";
import ItemScene from "./ItemScene";
import Tooltip from "./Tooltip";
import RuneBagPicker from "./RuneBagPicker";
import { renderDescription, SigilExplainer, SigilPenaltyLine, splitPenalty } from "./descriptionText";
import goldIconUrl from "/assets/icons/gold-64x64.png?url";
import frameUrl from "/assets/ui/frame.png?url";
import innerFrameUrl from "/assets/ui/inner-frame.png?url";
import innerFrameGreenUrl from "/assets/ui/inner-frame-green.png?url";
import buttonGreenUrl from "/assets/ui/button-green.png?url";
import buttonGreenHoverUrl from "/assets/ui/button-green-hover.png?url";
import buttonGreenDisabledUrl from "/assets/ui/button-green-disabled.png?url";
import styles from "./ShopScreen.module.css";

// Slide durations for the shop <-> picker content swap inside the
// center column. Kept snappy so the purchase → picker transition
// doesn't feel laggy.
const CONTENT_EXIT_S = 0.22;
const CONTENT_ENTER_S = 0.32;

const panelStyleVars = {
    ...createPanelStyleVars(),
    "--reroll-bg": `url(${innerFrameGreenUrl})`,
} as CSSProperties;
const buttonStyleVars = {
    "--btn-bg": `url(${buttonGreenUrl})`,
    "--btn-bg-hover": `url(${buttonGreenHoverUrl})`,
    "--btn-bg-disabled": `url(${buttonGreenDisabledUrl})`,
} as CSSProperties;
const cardStyleVars = {
    "--card-bg": `url(${frameUrl})`,
    "--buy-bg": `url(${innerFrameGreenUrl})`,
    "--tooltip-desc-bg": `url(${innerFrameUrl})`,
} as CSSProperties;

type ShopScreenProps = {
    ref?: React.Ref<HTMLDivElement>;
};

export default function ShopScreen({ ref }: ShopScreenProps = {}) {
    const shopItems = useShopItems();
    const gold = useGold();
    const scrollLevels = useScrollLevels();
    const pendingBagRunes = usePendingBagRunes();
    const sigils = useSigils();
    const sigilBarFull = sigils.length >= MAX_SIGILS;

    const panelRef = useRef<HTMLDivElement>(null);
    const shopContentRef = useRef<HTMLDivElement>(null);
    const pickerContentRef = useRef<HTMLDivElement>(null);
    const [selectedShopIndex, setSelectedShopIndex] = useState<number | null>(null);

    // `renderedMode` lags the live picker state during exit animations so
    // React keeps the outgoing element mounted while GSAP slides it out.
    // Same pattern used by ArkynOverlay's shop <-> playing swap.
    const showPicker = pendingBagRunes.length > 0;
    const [renderedMode, setRenderedMode] = useState<"shop" | "picker">(showPicker ? "picker" : "shop");

    useLayoutEffect(() => {
        const targetMode: "shop" | "picker" = showPicker ? "picker" : "shop";
        if (targetMode === renderedMode) return;

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
    }, [showPicker, renderedMode]);

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

    // Deselect when the user clicks outside the shop panel. Card onClick
    // handles in-panel selection changes via React state; this listener only
    // fires for genuinely-outside clicks.
    useEffect(() => {
        if (selectedShopIndex === null) return;
        const handleDocClick = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setSelectedShopIndex(null);
            }
        };
        document.addEventListener("click", handleDocClick);
        return () => document.removeEventListener("click", handleDocClick);
    }, [selectedShopIndex]);

    // Clear selection if the selected item is purchased or leaves the shop,
    // so a stale Buy button doesn't linger.
    useEffect(() => {
        if (selectedShopIndex === null) return;
        const stillAvailable = shopItems[selectedShopIndex] && !shopItems[selectedShopIndex].purchased;
        if (!stillAvailable) setSelectedShopIndex(null);
    }, [shopItems, selectedShopIndex]);

    const handleContinue = () => {
        playButton();
        sendReady();
    };

    const handleBuy = (shopIndex: number, element: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const currentLevel = scrollLevels.get(element) ?? 0;
        const levelsGained = getScrollLevelsPerUse(sigils);
        sendBuyItem(shopIndex);
        playBuy();
        // Find the scroll image in the card to get its bounding rect
        const card = (e.currentTarget as HTMLElement).closest(`.${styles.itemCard}`);
        const img = card?.querySelector(`.${styles.itemImage}`) as HTMLElement | null;
        const fromRect = img?.getBoundingClientRect() ?? new DOMRect(
            window.innerWidth / 2, window.innerHeight / 2, 0, 0,
        );
        emitScrollPurchase({
            element,
            oldLevel: currentLevel + 1,
            newLevel: currentLevel + 1 + levelsGained,
            fromRect,
        });
        setSelectedShopIndex(null);
    };

    // Split items by type for section rendering. Scrolls and Rune Bags
    // share the Consumables section — the card layout branches on itemType
    // inside the map below.
    const sigilItems = shopItems
        .map((item, idx) => ({ ...item, shopIndex: idx }))
        .filter(item => item.itemType === "sigil" && !item.purchased);
    const consumableItems = shopItems
        .map((item, idx) => ({ ...item, shopIndex: idx }))
        .filter(item => (item.itemType === "scroll" || item.itemType === "runeBag") && !item.purchased);

    const runeBagImageUrl = getRuneBagImageUrl(128);

    return (
        <div ref={ref} className={styles.wrapper}>
        {renderedMode === "shop" && (
        <div ref={shopContentRef} className={styles.shopContent}>
        <div ref={panelRef} className={styles.panel} style={panelStyleVars}>
            {/* Sigils section */}
            <span className={styles.sectionLabel}>Sigils</span>
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
                        // Tooltip flips side based on card position so it always
                        // extends outward (never overlapping neighbor cards).
                        const tooltipPlacement = i < sigilItems.length / 2 ? "left" : "right";

                        return (
                            <div
                                key={item.shopIndex}
                                className={`${styles.itemCard} ${!canAfford ? styles.itemCardCantAfford : ""} ${isSelected ? styles.itemCardSelected : ""}`}
                                style={{ ...cardStyleVars } as CSSProperties}
                                onClick={() => setSelectedShopIndex(prev => prev === item.shopIndex ? null : item.shopIndex)}
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
                                    {isSelected && (
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
                                <Tooltip placement={tooltipPlacement} arrow variant="framed">
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

            {/* Consumables section (scrolls + rune bags) */}
            <span className={styles.sectionLabel}>Consumables</span>
            <div className={`${styles.section} ${styles.consumablesSection}`}>
                <div className={styles.itemGrid}>
                    {consumableItems.map((item, i) => {
                        const canAfford = gold >= item.cost;
                        const isSelected = selectedShopIndex === item.shopIndex;
                        const tooltipPlacement = i < consumableItems.length / 2 ? "left" : "right";
                        const itemSceneIndex = sigilItems.length + i;

                        if (item.itemType === "runeBag") {
                            return (
                                <div
                                    key={item.shopIndex}
                                    className={`${styles.itemCard} ${!canAfford ? styles.itemCardCantAfford : ""} ${isSelected ? styles.itemCardSelected : ""}`}
                                    style={{ ...cardStyleVars } as CSSProperties}
                                    onClick={() => setSelectedShopIndex(prev => prev === item.shopIndex ? null : item.shopIndex)}
                                >
                                    <div className={styles.priceChip}>
                                        <img src={goldIconUrl} alt="Gold" className={styles.priceIcon} />
                                        <span className={styles.priceValue}>{item.cost}</span>
                                    </div>

                                    <div className={styles.cardImageWrap}>
                                        <ItemScene
                                            itemId="rune_bag"
                                            index={itemSceneIndex}
                                            imageUrl={runeBagImageUrl}
                                            useFrame={false}
                                            className={styles.sigilCanvas}
                                        />
                                        {isSelected && (
                                            <button
                                                type="button"
                                                className={styles.buyButton}
                                                style={buttonStyleVars}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!canAfford) return;
                                                    sendBuyItem(item.shopIndex);
                                                    playBuy();
                                                    setSelectedShopIndex(null);
                                                }}
                                                disabled={!canAfford}
                                            >
                                                Buy
                                            </button>
                                        )}
                                    </div>

                                    <Tooltip placement={tooltipPlacement} arrow variant="framed">
                                        <span className={styles.tooltipName}>
                                            Rune Bag
                                        </span>
                                        <div className={styles.tooltipDescWrap}>
                                            <span className={styles.tooltipDesc}>
                                                Opens 4 random runes. Pick one to add permanently to your pouch.
                                            </span>
                                        </div>
                                    </Tooltip>
                                </div>
                            );
                        }

                        // Scroll card (existing layout).
                        const elementColor = ELEMENT_COLORS[item.element] ?? "#aaa";
                        const scrollUrl = getScrollImageUrl(item.element);
                        const elementName = item.element.charAt(0).toUpperCase() + item.element.slice(1);

                        return (
                            <div
                                key={item.shopIndex}
                                className={`${styles.itemCard} ${!canAfford ? styles.itemCardCantAfford : ""} ${isSelected ? styles.itemCardSelected : ""}`}
                                style={{ ...cardStyleVars } as CSSProperties}
                                onClick={() => setSelectedShopIndex(prev => prev === item.shopIndex ? null : item.shopIndex)}
                            >
                                {/* Gold price at top of card */}
                                <div className={styles.priceChip}>
                                    <img src={goldIconUrl} alt="Gold" className={styles.priceIcon} />
                                    <span className={styles.priceValue}>{item.cost}</span>
                                </div>

                                {/* Scroll image — centered in remaining space */}
                                <div className={styles.cardImageWrap}>
                                    <ItemScene
                                        itemId={item.element}
                                        index={itemSceneIndex}
                                        imageUrl={scrollUrl}
                                        className={styles.sigilCanvas}
                                    />
                                    {/* Click-to-reveal buy button */}
                                    {isSelected && (
                                        <button
                                            type="button"
                                            className={styles.buyButton}
                                            style={buttonStyleVars}
                                            onClick={(e) => handleBuy(item.shopIndex, item.element, e)}
                                            disabled={!canAfford}
                                        >
                                            Buy
                                        </button>
                                    )}
                                </div>

                                {/* Tooltip — visible on hover */}
                                <Tooltip placement={tooltipPlacement} arrow variant="framed">
                                    <span className={styles.tooltipName} style={{ color: elementColor }}>
                                        {elementName} Scroll
                                    </span>
                                    <div className={styles.tooltipDescWrap}>
                                        <span className={styles.tooltipDesc}>
                                            +2 base damage to all {elementName} runes.
                                        </span>
                                    </div>
                                </Tooltip>
                            </div>
                        );
                    })}
                </div>
            </div>

        </div>
        <button
            type="button"
            onClick={handleContinue}
            className={styles.continueButton}
            style={buttonStyleVars}
        >
            Next Round
        </button>
        </div>
        )}

        {renderedMode === "picker" && (
            <RuneBagPicker ref={pickerContentRef} runes={pendingBagRunes} />
        )}
        </div>
    );
}
