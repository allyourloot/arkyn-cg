import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
    sendReady,
    sendBuyItem,
    useShopItems,
    useGold,
    useScrollLevels,
    emitScrollPurchase,
    emitSigilPurchase,
} from "../arkynStore";
import { SIGIL_DEFINITIONS } from "../../shared/sigils";
import { playButton, playBuy } from "../sfx";
import { ELEMENT_COLORS, createPanelStyleVars } from "./styles";
import { getScrollImageUrl } from "./scrollAssets";
import BouncyText from "./BouncyText";
import ItemScene from "./ItemScene";
import Tooltip from "./Tooltip";
import { renderDescription, SigilExplainer } from "./descriptionText";
import goldIconUrl from "/assets/icons/gold-64x64.png?url";
import frameUrl from "/assets/ui/frame.png?url";
import innerFrameUrl from "/assets/ui/inner-frame.png?url";
import innerFrameGreenUrl from "/assets/ui/inner-frame-green.png?url";
import buttonGreenUrl from "/assets/ui/button-green.png?url";
import buttonGreenHoverUrl from "/assets/ui/button-green-hover.png?url";
import buttonGreenDisabledUrl from "/assets/ui/button-green-disabled.png?url";
import styles from "./ShopScreen.module.css";

const RARITY_COLORS: Record<string, string> = {
    common: "#b0b0b0",
    uncommon: "#4ade80",
    rare: "#f87171",
    legendary: "#fbbf24",
};

const panelStyleVars = createPanelStyleVars();
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

    const panelRef = useRef<HTMLDivElement>(null);
    const [selectedShopIndex, setSelectedShopIndex] = useState<number | null>(null);

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
            newLevel: currentLevel + 2,
            fromRect,
        });
        setSelectedShopIndex(null);
    };

    // Split items by type for section rendering
    const sigilItems = shopItems
        .map((item, idx) => ({ ...item, shopIndex: idx }))
        .filter(item => item.itemType === "sigil" && !item.purchased);
    const scrollItems = shopItems
        .map((item, idx) => ({ ...item, shopIndex: idx }))
        .filter(item => item.itemType === "scroll" && !item.purchased);

    return (
        <div ref={ref} className={styles.wrapper}>
        <div ref={panelRef} className={styles.panel} style={panelStyleVars}>
            {/* Sigils section */}
            <span className={styles.sectionLabel}>Sigils</span>
            <div className={styles.section}>
                <div className={styles.itemGrid}>
                    {sigilItems.length > 0 ? sigilItems.map((item, i) => {
                        const def = SIGIL_DEFINITIONS[item.element];
                        if (!def) return null;
                        const canAfford = gold >= item.cost;
                        const rarityColor = RARITY_COLORS[def.rarity] ?? "#b0b0b0";
                        const isSelected = selectedShopIndex === item.shopIndex;

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
                                                if (!canAfford) return;
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
                                            disabled={!canAfford}
                                        >
                                            Buy
                                        </button>
                                    )}
                                </div>
                                <Tooltip placement="left" arrow variant="framed">
                                    <span className={styles.tooltipName}>
                                        {def.name}
                                    </span>
                                    <div className={styles.tooltipDescWrap}>
                                        <span className={styles.tooltipDesc}>
                                            {renderDescription(def.description)}
                                        </span>
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

            {/* Scrolls section */}
            <span className={styles.sectionLabel}>Scrolls</span>
            <div className={styles.section}>
                <div className={styles.itemGrid}>
                    {scrollItems.map((item, i) => {
                        const elementColor = ELEMENT_COLORS[item.element] ?? "#aaa";
                        const scrollUrl = getScrollImageUrl(item.element);
                        const canAfford = gold >= item.cost;
                        const elementName = item.element.charAt(0).toUpperCase() + item.element.slice(1);
                        const isSelected = selectedShopIndex === item.shopIndex;

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
                                        index={sigilItems.length + i}
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
                                <Tooltip placement="left" arrow variant="framed">
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
    );
}
