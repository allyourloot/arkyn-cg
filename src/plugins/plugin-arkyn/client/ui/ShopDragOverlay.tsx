import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
    useActiveDrag,
    useShopItems,
    registerShopDragCloneEl,
} from "../arkynStore";
import { PACK_DEFINITIONS, type PackType } from "../../shared";
import { getPackImageUrl } from "./packAssets";
import ItemScene from "./ItemScene";
import styles from "./ShopDragOverlay.module.css";

const PACK_KEYS = new Set(Object.keys(PACK_DEFINITIONS));

/**
 * Portal host for the mobile shop drag-to-purchase clone. Mount once
 * at the top of `ArkynOverlay` (always-on, no-op when no drag is
 * active). When `useActiveDrag()` returns a non-null value, this
 * mounts the floating clone via `createPortal(..., document.body)` so
 * its z-index (105) sits above the shop panel + drop zones (21) but
 * below the OverlayShader (9999).
 *
 * The clone's per-frame position is driven imperatively by
 * `useShopItemDrag` via `gsap.quickSetter` on the registered DOM
 * element — this component does not re-render per pointermove. It
 * only re-renders when `activeDrag`'s identity changes (engage /
 * release).
 */
export default function ShopDragOverlay() {
    const activeDrag = useActiveDrag();
    const shopItems = useShopItems();
    const cloneRef = useRef<HTMLDivElement>(null);

    // Register the clone DOM with the store so the drag hook can grab
    // it on engage. useLayoutEffect runs synchronously after the DOM
    // commit so the registration is in place before the next
    // pointermove fires (the move handler that triggers engage runs
    // first, but it bails out early via ensureSetters → false; on the
    // next move the registration is live and the clone catches up).
    useLayoutEffect(() => {
        registerShopDragCloneEl(cloneRef.current);
        return () => registerShopDragCloneEl(null);
    }, [activeDrag]);

    if (!activeDrag) return null;

    const item = shopItems[activeDrag.shopIndex];
    if (!item) return null;

    // Branch on itemType: sigil renders with the standard frame; packs
    // get useFrame=false + their natural aspect/displayScale so the
    // clone visually matches what the player picked up off the shop.
    const isPack = PACK_KEYS.has(item.itemType);
    let scene: React.ReactNode;
    if (isPack) {
        const packId = item.itemType as PackType;
        const def = PACK_DEFINITIONS[packId];
        if (!def) return null;
        scene = (
            <ItemScene
                itemId={packId}
                index={-2}
                imageUrl={getPackImageUrl(packId, 128)}
                useFrame={false}
                aspectRatio={def.aspectRatio}
                displayScale={def.displayScale}
                className={styles.cloneCanvas}
            />
        );
    } else {
        scene = (
            <ItemScene
                itemId={item.element}
                index={-2}
                className={styles.cloneCanvas}
            />
        );
    }

    return createPortal(
        <div ref={cloneRef} className={styles.cloneCard} aria-hidden="true">
            {scene}
        </div>,
        document.body,
    );
}
