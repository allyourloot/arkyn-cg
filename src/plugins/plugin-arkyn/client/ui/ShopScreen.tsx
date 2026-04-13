import type { CSSProperties } from "react";
import {
    sendReady,
    sendBuyItem,
    useShopItems,
    useGold,
    useScrollLevels,
    emitScrollPurchase,
} from "../arkynStore";
import { playMenuOpen } from "../sfx";
import { ELEMENT_COLORS, createPanelStyleVars } from "./styles";
import { getScrollImageUrl } from "./scrollAssets";
import BouncyText from "./BouncyText";
import goldIconUrl from "/assets/icons/gold-64x64.png?url";
import buttonGreenUrl from "/assets/ui/button-green.png?url";
import buttonGreenHoverUrl from "/assets/ui/button-green-hover.png?url";
import buttonGreenDisabledUrl from "/assets/ui/button-green-disabled.png?url";
import styles from "./ShopScreen.module.css";

const panelStyleVars = createPanelStyleVars();
const buttonStyleVars = {
    "--btn-bg": `url(${buttonGreenUrl})`,
    "--btn-bg-hover": `url(${buttonGreenHoverUrl})`,
    "--btn-bg-disabled": `url(${buttonGreenDisabledUrl})`,
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
    const scrollItems = shopItems
        .map((item, idx) => ({ ...item, shopIndex: idx }))
        .filter(item => item.itemType === "scroll");

    return (
        <div ref={ref} className={styles.panel} style={panelStyleVars}>
            <span className={styles.title}>Shop</span>

            {/* Sigils section — placeholder for future implementation */}
            <div className={styles.section}>
                <span className={styles.sectionTitle}>Sigils</span>
                <div className={styles.itemGrid}>
                    <div className={styles.placeholderCard}>
                        <BouncyText className={styles.placeholderText}>
                            Coming Soon
                        </BouncyText>
                    </div>
                    <div className={styles.placeholderCard}>
                        <BouncyText className={styles.placeholderText}>
                            Coming Soon
                        </BouncyText>
                    </div>
                </div>
            </div>

            {/* Scrolls section */}
            <div className={styles.section}>
                <span className={styles.sectionTitle}>Scrolls</span>
                <div className={styles.itemGrid}>
                    {scrollItems.map(item => {
                        const elementColor = ELEMENT_COLORS[item.element] ?? "#aaa";
                        const scrollUrl = getScrollImageUrl(item.element);
                        const canAfford = gold >= item.cost;
                        const elementName = item.element.charAt(0).toUpperCase() + item.element.slice(1);

                        return (
                            <div
                                key={item.shopIndex}
                                className={`${styles.itemCard} ${item.purchased ? styles.itemCardSold : ""} ${!canAfford && !item.purchased ? styles.itemCardCantAfford : ""}`}
                                style={{
                                    "--element-color": elementColor,
                                    "--element-bg": elementColor + "33",
                                } as CSSProperties}
                            >
                                {/* Price chip — anchored to top edge */}
                                <div className={styles.priceChip}>
                                    <img src={goldIconUrl} alt="Gold" className={styles.priceIcon} />
                                    <span className={styles.priceValue}>{item.cost}</span>
                                </div>

                                {/* Card body */}
                                <div className={styles.cardBody}>
                                    {scrollUrl && (
                                        <img
                                            src={scrollUrl}
                                            alt={`${elementName} Scroll`}
                                            className={styles.itemImage}
                                        />
                                    )}
                                    <span className={styles.itemName} style={{ color: elementColor }}>
                                        {elementName}
                                    </span>
                                </div>

                                {/* Hover buy button — right side */}
                                {!item.purchased && (
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

                                {/* Tooltip — visible on hover */}
                                {!item.purchased && (
                                    <div className={styles.tooltip}>
                                        <span className={styles.tooltipDesc}>
                                            +2 base damage to all {elementName} runes.
                                        </span>
                                    </div>
                                )}

                                {/* Sold overlay */}
                                {item.purchased && (
                                    <div className={styles.soldOverlay}>
                                        <span className={styles.soldLabel}>Sold</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
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
