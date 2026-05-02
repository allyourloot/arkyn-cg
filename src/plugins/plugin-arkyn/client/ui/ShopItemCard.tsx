import type { CSSProperties, ReactElement, ReactNode } from "react";
import { HAS_HOVER } from "./utils/hasHover";
import Tooltip from "./Tooltip";
import goldIconUrl from "/assets/icons/gold-64x64.png?url";
import styles from "./ShopScreen.module.css";

/**
 * Cross-variant event-handler shape. The branching between desktop
 * (`onClick` to toggle selection) and mobile (`onPointerDown` to engage
 * the drag-to-purchase gesture) is built in the consumer (ShopScreen) so
 * this component stays a presentation layer — both card variants spread
 * the resulting object onto the outer card div.
 */
export type ShopItemCardHandlers =
    | { onClick: () => void }
    | { onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void };

interface ShopItemCardProps {
    shopIndex: number;
    cost: number;
    canAfford: boolean;
    isSelected: boolean;
    isMobileTooltip: boolean;
    tooltipPlacement: "left" | "right";
    cardStyleVars: CSSProperties;
    buttonStyleVars: CSSProperties;
    cardEventHandlers: ShopItemCardHandlers;
    /** "sigil" places the price chip OUTSIDE the cardImageWrap (anchored
     *  against the full card box). "pack" places it INSIDE a shrunken
     *  cardImageWrap so the chip's `top: -15%` resolves against the
     *  visible portrait-art bounds rather than the square canvas. */
    variant: "sigil" | "pack";
    /** Pre-built ItemScene element. Pre-building lets each variant pass
     *  its own variant-specific props (sigil: itemId/index/className;
     *  pack: itemId/index/imageUrl/useFrame/aspectRatio/displayScale/className)
     *  without this component having to know any of them. */
    itemScene: ReactElement;
    /** When false (e.g. canAfford=false on a sigil, or sigil-bar-full),
     *  the BUY button renders disabled and routes through `onBuyClick`'s
     *  early-return guard. Sigils use canAfford && !sigilBarFull; packs
     *  use canAfford only — caller computes the right value. */
    buyEnabled: boolean;
    onBuyClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
    /** Optional native `title` on the BUY button — sigils use this to
     *  surface "Sigil bar full — sell a sigil to make room" when
     *  affordable but unbuyable. Packs leave it undefined. */
    buyTitle?: string;
    /** Body content of the Tooltip. Sigils render name + split-penalty
     *  description + optional explainer + rarity chip. Packs render
     *  name + plain description. Caller constructs the tree. */
    tooltipBody: ReactNode;
}

/**
 * Single shop-card primitive used for both sigils (Items section) and
 * packs (Packs section). Variant differences are isolated to:
 *   - whether the price chip sits inside or outside the cardImageWrap
 *   - which extra CSS classes apply (packCardImageWrap, packPriceChip,
 *     packBuyButton, packTooltip)
 *   - the ItemScene element + BUY click + tooltip body, all of which
 *     the caller supplies as ready-made props.
 *
 * Outer-card classes (`itemCard`, `itemCardCantAfford`, `itemCardSelected`)
 * and the BUY-when-selected reveal pattern (`HAS_HOVER && isSelected`)
 * are identical across variants, so they live here.
 */
export default function ShopItemCard({
    shopIndex,
    cost,
    canAfford,
    isSelected,
    isMobileTooltip,
    tooltipPlacement,
    cardStyleVars,
    buttonStyleVars,
    cardEventHandlers,
    variant,
    itemScene,
    buyEnabled,
    onBuyClick,
    buyTitle,
    tooltipBody,
}: ShopItemCardProps) {
    const isPack = variant === "pack";

    const priceChip = (
        <div className={`${styles.priceChip}${isPack ? " " + styles.packPriceChip : ""}`}>
            <img src={goldIconUrl} alt="Gold" className={styles.priceIcon} />
            <span className={styles.priceValue}>{cost}</span>
        </div>
    );

    const buyButton = HAS_HOVER && isSelected ? (
        <button
            type="button"
            className={`${styles.buyButton}${isPack ? " " + styles.packBuyButton : ""}`}
            style={buttonStyleVars}
            onClick={onBuyClick}
            disabled={!buyEnabled}
            title={buyTitle}
        >
            Buy
        </button>
    ) : null;

    const cardImageWrap = (
        <div className={`${styles.cardImageWrap}${isPack ? " " + styles.packCardImageWrap : ""}`}>
            {isPack && priceChip}
            {itemScene}
            {buyButton}
        </div>
    );

    const tooltipClassName = isPack
        ? `${styles.packTooltip}${isMobileTooltip ? " " + styles.tooltipForceShow : ""}`
        : (isMobileTooltip ? styles.tooltipForceShow : undefined);

    return (
        <div
            data-shop-index={shopIndex}
            className={`${styles.itemCard} ${!canAfford ? styles.itemCardCantAfford : ""} ${isSelected ? styles.itemCardSelected : ""}`}
            style={cardStyleVars}
            {...cardEventHandlers}
        >
            {!isPack && priceChip}
            {cardImageWrap}
            <Tooltip
                placement={tooltipPlacement}
                arrow
                variant="framed"
                className={tooltipClassName}
            >
                {tooltipBody}
            </Tooltip>
        </div>
    );
}
