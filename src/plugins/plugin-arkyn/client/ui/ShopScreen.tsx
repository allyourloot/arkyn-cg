import type { CSSProperties } from "react";
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
import { playMenuOpen, playBuy } from "../sfx";
import { ELEMENT_COLORS, createPanelStyleVars } from "./styles";
import { getScrollImageUrl } from "./scrollAssets";
import BouncyText from "./BouncyText";
import ItemScene from "./ItemScene";
import Tooltip from "./Tooltip";
import goldIconUrl from "/assets/icons/gold-64x64.png?url";
import frameUrl from "/assets/ui/frame.png?url";
import innerFrameGreenUrl from "/assets/ui/inner-frame-green.png?url";
import buttonGreenUrl from "/assets/ui/button-green.png?url";
import buttonGreenHoverUrl from "/assets/ui/button-green-hover.png?url";
import buttonGreenDisabledUrl from "/assets/ui/button-green-disabled.png?url";
import styles from "./ShopScreen.module.css";

const RARITY_COLORS: Record<string, string> = {
    common: "#b0b0b0",
    uncommon: "#4ade80",
    rare: "#60a5fa",
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
} as CSSProperties;

type ShopScreenProps = {
    ref?: React.Ref<HTMLDivElement>;
};

export default function ShopScreen({ ref }: ShopScreenProps = {}) {
    const shopItems = useShopItems();
    const gold = useGold();
    const scrollLevels = useScrollLevels();

    const handleContinue = () => {
        playMenuOpen();
        sendReady();
    };

    const handleBuy = (shopIndex: number, element: string, e: React.MouseEvent) => {
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
        <div className={styles.panel} style={panelStyleVars}>
            {/* Sigils section */}
            <span className={styles.sectionLabel}>Sigils</span>
            <div className={styles.section}>
                <div className={styles.itemGrid}>
                    {sigilItems.length > 0 ? sigilItems.map((item, i) => {
                        const def = SIGIL_DEFINITIONS[item.element];
                        if (!def) return null;
                        const canAfford = gold >= item.cost;
                        const rarityColor = RARITY_COLORS[def.rarity] ?? "#b0b0b0";

                        return (
                            <div
                                key={item.shopIndex}
                                className={`${styles.itemCard} ${!canAfford ? styles.itemCardCantAfford : ""}`}
                                style={{ ...cardStyleVars } as CSSProperties}
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
                                </div>
                                <button
                                    type="button"
                                    className={styles.buyButton}
                                    style={buttonStyleVars}
                                    onClick={(e) => {
                                        sendBuyItem(item.shopIndex);
                                        playBuy();
                                        const card = (e.currentTarget as HTMLElement).closest(`.${styles.itemCard}`);
                                        const canvas = card?.querySelector(`.${styles.sigilCanvas}`) as HTMLElement | null;
                                        const fromRect = canvas?.getBoundingClientRect() ?? new DOMRect(
                                            window.innerWidth / 2, window.innerHeight / 2, 0, 0,
                                        );
                                        emitSigilPurchase({ sigilId: item.element, fromRect });
                                    }}
                                    disabled={!canAfford}
                                >
                                    Buy
                                </button>
                                <Tooltip placement="left" variant="plain">
                                    <span className={styles.tooltipDesc} style={{ color: rarityColor, fontWeight: "normal" }}>
                                        {def.name} <span style={{ opacity: 0.7, textTransform: "uppercase", fontSize: "0.85em" }}>({def.rarity})</span>
                                    </span>
                                    <span className={styles.tooltipDesc}>
                                        {def.description}
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

                        return (
                            <div
                                key={item.shopIndex}
                                className={`${styles.itemCard} ${!canAfford ? styles.itemCardCantAfford : ""}`}
                                style={{ ...cardStyleVars } as CSSProperties}
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
                                </div>

                                {/* Hover buy button */}
                                <button
                                    type="button"
                                    className={styles.buyButton}
                                    style={buttonStyleVars}
                                    onClick={(e) => handleBuy(item.shopIndex, item.element, e)}
                                    disabled={!canAfford}
                                >
                                    Buy
                                </button>

                                {/* Tooltip — visible on hover */}
                                <Tooltip placement="left" variant="plain">
                                    <span className={styles.tooltipDesc}>
                                        +2 base damage to all {elementName} runes.
                                    </span>
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
