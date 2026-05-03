import { useLayoutEffect, useRef } from "react";
import {
    useActiveDrag,
    useShopDropZonePreview,
    registerShopDropZone,
    type ShopDropZoneKind,
} from "../arkynStore";
import styles from "./ShopDropZone.module.css";

interface ShopDropZoneProps {
    kind: ShopDropZoneKind;
}

/**
 * Mobile shop drag-to-purchase drop zone. Two instances exist while the
 * shop is open:
 *   - `kind="sigil"` mounted inside `SigilBar`'s `.sigilFrame` — overlays
 *     the bar so the player can drop a dragged sigil onto its
 *     destination home.
 *   - `kind="pack"` mounted at the top of `ArkynOverlay` — fixed to the
 *     right edge of the viewport. The shop panel can exceed viewport
 *     width on portrait mobile, so we anchor to the viewport rather
 *     than to the panel.
 *
 * Both instances are always rendered so their DOM rect is registered
 * once on mount; visibility is toggled via the `.zoneVisible` class
 * when the active drag's `targetKind` matches. Pointer events stay
 * disabled — the drag hook hit-tests by reading
 * `getShopDropZoneEl(kind).getBoundingClientRect()`, not via DOM
 * events. The active "pointer is currently over me" highlight is set
 * imperatively by the hook via the `.dropZoneActive` global class
 * (defined inside the module CSS via `:global(.dropZoneActive)`).
 */
export default function ShopDropZone({ kind }: ShopDropZoneProps) {
    const activeDrag = useActiveDrag();
    const previewKind = useShopDropZonePreview();
    const ref = useRef<HTMLDivElement>(null);
    // Two visibility paths:
    //   1. activeDrag    — the player has actually engaged drag; this is
    //                      the live "drop here" target.
    //   2. previewKind   — the player tapped a buyable card to open its
    //                      tooltip, but hasn't dragged yet. Showing the
    //                      zone in this state surfaces the drag-to-buy
    //                      affordance for players who don't intuit it
    //                      from a tap alone.
    const visible = activeDrag?.targetKind === kind || previewKind === kind;

    useLayoutEffect(() => {
        registerShopDropZone(kind, ref.current);
        return () => registerShopDropZone(kind, null);
    }, [kind]);

    const label = kind === "sigil" ? "Drag sigil here to buy" : "Drag pack here to buy";
    const kindClass = kind === "sigil" ? styles.zoneSigil : styles.zonePack;

    return (
        <div
            ref={ref}
            className={`${styles.zone} ${kindClass} ${visible ? styles.zoneVisible : ""}`}
            aria-hidden="true"
        >
            <span className={styles.label}>{label}</span>
        </div>
    );
}
