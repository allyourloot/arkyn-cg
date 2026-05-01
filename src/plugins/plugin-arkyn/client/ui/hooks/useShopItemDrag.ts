import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { gsap } from "gsap";
import {
    setActiveDrag,
    getShopDropZoneEl,
    getShopDragCloneEl,
    type ShopDragItemType,
    type ShopDropZoneKind,
} from "../../arkynStore";
import { playPickupRune, playDropRune } from "../../sfx";

const DRAG_THRESHOLD_PX = 6;
/** Movement-triggered drag engages once the pointer has moved this far
    AND been held this long. Same value as `useSigilDragReorder` so a
    quick tap on a shop card never accidentally triggers drag, which
    on mobile would block the tap-tooltip path. */
const DRAG_HOLD_MS = 150;
/** Stationary tap-and-hold that lasts this long ALSO engages drag —
    even with zero movement. Without this, a player who taps and holds
    has no visual signal that the item is draggable (drop zones only
    appear once a drag is engaged). 250ms is long enough that an
    intentional tap → release for the tooltip never crosses the
    threshold, but short enough that the "lift" feels responsive. */
const HOLD_TO_ENGAGE_MS = 250;

export interface UseShopItemDragOptions {
    /** Tap callback — fires when the gesture is a stationary press
        (no movement past threshold, no hold past `DRAG_HOLD_MS`). On
        mobile this opens the per-card tooltip. */
    onTap: (shopIndex: number) => void;
    /** Called on a successful drop over a valid drop zone for a buyable
        item. `fromRect` is the clone's current rect at release — the
        consumer uses it as the fly-in starting point for whatever
        purchase animation it dispatches (`emitSigilPurchase` /
        `emitPackPurchase`). Consumer is responsible for sending
        `sendBuyItem` and emitting the appropriate purchase event. */
    onDrop: (
        shopIndex: number,
        itemType: ShopDragItemType,
        fromRect: DOMRect,
    ) => void;
}

export interface UseShopItemDragResult {
    onCardPointerDown: (
        e: ReactPointerEvent<HTMLDivElement>,
        shopIndex: number,
        itemType: ShopDragItemType,
        isBuyable: boolean,
        /** The on-screen rect to use as the clone's initial position +
            size. Pass the inner canvas wrapper's rect (not the whole
            card) so the clone visually matches the item art the player
            picked up — full-card rect would render the canvas too small
            inside an oversized box. */
        fromRect: DOMRect,
    ) => void;
}

function targetKindFor(t: ShopDragItemType): ShopDropZoneKind {
    return t === "sigil" ? "sigil" : "pack";
}

function rectContains(rect: DOMRect, x: number, y: number): boolean {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * Mobile drag-to-purchase hook for shop items. Mirrors the structure of
 * `useSigilDragReorder` (window pointer listeners + threshold + GSAP
 * `quickSetter` for low-latency transforms) but dispatches across
 * containers via the `setActiveDrag` store slice and the
 * `registerShopDropZone` registry instead of in-row reordering.
 *
 * Call `onCardPointerDown(e, shopIndex, itemType, isBuyable)` from each
 * shop card's `onPointerDown` (mobile only — desktop keeps its
 * tap-to-select-then-BUY flow). The hook handles tap vs. drag
 * disambiguation: stationary press → `onTap`; movement past threshold
 * → drag engages, `setActiveDrag` mounts the clone via
 * `ShopDragOverlay`, drop zones light up, release dispatches the buy.
 *
 * Unbuyable items short-circuit the drag (drag-start on threshold cross
 * cancels rather than engaging) but still allow tap-through so the
 * tooltip stays accessible.
 */
export function useShopItemDrag({
    onTap,
    onDrop,
}: UseShopItemDragOptions): UseShopItemDragResult {
    const startXRef = useRef(0);
    const startYRef = useRef(0);
    const downTimeRef = useRef(0);
    /** True once the drag visual is live (clone shown, drop zones
        visible, source card dimmed). Set by either path:
          1. Movement past `DRAG_THRESHOLD_PX` after `DRAG_HOLD_MS`
          2. Stationary hold for `HOLD_TO_ENGAGE_MS`
        Once engaged, pointerup commits to drop logic (not tap). */
    const engagedRef = useRef(false);
    /** shopIndex captured at pointerdown but BEFORE engagement —
        kept around so a tap-without-engage (quick release, no hold)
        can fire `onTap` with the right index. */
    const pendingShopIndexRef = useRef<number | null>(null);
    const fromRectRef = useRef<DOMRect | null>(null);
    const targetKindRef = useRef<ShopDropZoneKind | null>(null);
    const xSetterRef = useRef<((v: number) => void) | null>(null);
    const ySetterRef = useRef<((v: number) => void) | null>(null);
    const cleanupRef = useRef<(() => void) | null>(null);
    const sourceCardElRef = useRef<HTMLElement | null>(null);
    const holdTimerRef = useRef<number | null>(null);

    const teardownListeners = () => {
        if (cleanupRef.current) {
            cleanupRef.current();
            cleanupRef.current = null;
        }
        if (holdTimerRef.current !== null) {
            window.clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        }
    };

    const ensureSetters = (): boolean => {
        if (xSetterRef.current && ySetterRef.current) return true;
        const cloneEl = getShopDragCloneEl();
        const fromRect = fromRectRef.current;
        if (!cloneEl || !fromRect) return false;
        // Set initial size + position so the clone paints at the source
        // card's location instead of (0,0). gsap.set writes the
        // transform directly; subsequent quickSetter calls update only
        // x/y so there's no per-frame layout work.
        gsap.set(cloneEl, {
            x: fromRect.left,
            y: fromRect.top,
            width: fromRect.width,
            height: fromRect.height,
            opacity: 1,
        });
        xSetterRef.current = gsap.quickSetter(cloneEl, "x", "px") as (v: number) => void;
        ySetterRef.current = gsap.quickSetter(cloneEl, "y", "px") as (v: number) => void;
        return true;
    };

    const updateActiveDropZone = (clientX: number, clientY: number) => {
        const kind = targetKindRef.current;
        if (!kind) return;
        const zone = getShopDropZoneEl(kind);
        if (!zone) return;
        const rect = zone.getBoundingClientRect();
        const isInside = rectContains(rect, clientX, clientY);
        // Global class — matched by ShopDropZone.module.css via
        // `:global(.dropZoneActive)`. Toggling on the DOM directly
        // avoids a per-frame React re-render.
        zone.classList.toggle("dropZoneActive", isInside);
    };

    const resetState = () => {
        const cloneEl = getShopDragCloneEl();
        if (cloneEl) {
            gsap.set(cloneEl, { clearProps: "x,y,width,height,opacity,scale" });
        }
        const targetKind = targetKindRef.current;
        if (targetKind) {
            const zone = getShopDropZoneEl(targetKind);
            zone?.classList.remove("dropZoneActive");
        }
        const sourceEl = sourceCardElRef.current;
        if (sourceEl) {
            sourceEl.style.opacity = "";
        }
        setActiveDrag(null);
        startXRef.current = 0;
        startYRef.current = 0;
        downTimeRef.current = 0;
        engagedRef.current = false;
        pendingShopIndexRef.current = null;
        fromRectRef.current = null;
        targetKindRef.current = null;
        xSetterRef.current = null;
        ySetterRef.current = null;
        sourceCardElRef.current = null;
    };

    const onCardPointerDown = (
        e: ReactPointerEvent<HTMLDivElement>,
        shopIndex: number,
        itemType: ShopDragItemType,
        isBuyable: boolean,
        fromRect: DOMRect,
    ) => {
        // Mouse: only left button. Touch / pen: button is 0 by spec.
        if (e.button !== undefined && e.button !== 0) return;

        const card = e.currentTarget as HTMLElement;
        const rect = fromRect;
        const targetKind = targetKindFor(itemType);

        teardownListeners();

        startXRef.current = e.clientX;
        startYRef.current = e.clientY;
        downTimeRef.current = performance.now();
        engagedRef.current = false;
        pendingShopIndexRef.current = shopIndex;
        fromRectRef.current = rect;
        targetKindRef.current = targetKind;
        sourceCardElRef.current = card;

        /**
         * Promote the gesture to "drag is live": clone visible, drop
         * zones visible, source dimmed. Called from two paths —
         *   1. `onMove` once movement crosses both thresholds, or
         *   2. The `holdTimerRef` setTimeout if the player held still.
         * Idempotent (engagedRef guards re-entry). Bails on
         * `!isBuyable` so an unbuyable item never enters drag mode
         * even via the hold path; tap-to-tooltip still works.
         */
        const engageDrag = () => {
            if (engagedRef.current) return;
            if (!isBuyable) return;
            engagedRef.current = true;
            pendingShopIndexRef.current = null;
            playPickupRune();
            setActiveDrag({
                shopIndex,
                itemType,
                targetKind,
                isBuyable,
                fromRect: rect,
            });
            if (sourceCardElRef.current) {
                // Dim the source card so the player sees the item
                // "move out" of its slot rather than appearing to
                // duplicate. Restored in resetState.
                sourceCardElRef.current.style.opacity = "0.35";
            }
            // React commits the clone next render; rAF gives it a
            // frame to mount + register so we can position it before
            // the user moves. Especially important on the hold-engage
            // path — without a pointermove to follow, the clone would
            // otherwise stay invisible (opacity 0) until the player
            // moved their finger.
            requestAnimationFrame(() => {
                if (!ensureSetters()) return;
                const cloneEl = getShopDragCloneEl();
                if (!cloneEl) return;
                // Subtle "lift off" pop so the player FEELS the drag
                // engage. Keeps the same x/y/width/height that
                // ensureSetters just wrote — only animates scale.
                gsap.fromTo(cloneEl,
                    { scale: 0.9 },
                    { scale: 1, duration: 0.22, ease: "back.out(2.6)", overwrite: false },
                );
            });
        };

        const onMove = (ev: PointerEvent) => {
            const dx = ev.clientX - startXRef.current;
            const dy = ev.clientY - startYRef.current;

            if (!engagedRef.current) {
                const dist = Math.hypot(dx, dy);
                if (dist < DRAG_THRESHOLD_PX) return;
                if ((performance.now() - downTimeRef.current) < DRAG_HOLD_MS) return;
                if (!isBuyable) {
                    // Unaffordable / sigil-bar-full: cancel the gesture
                    // entirely on movement. The pointerup handler then
                    // sees engaged=false and pendingShopIndex=null, so
                    // neither tap nor drop fires — the player gets no
                    // tooltip from a drag attempt on an unbuyable
                    // item, which reads as "this isn't gonna happen".
                    teardownListeners();
                    resetState();
                    return;
                }
                engageDrag();
            }

            if (!ensureSetters()) return;
            xSetterRef.current!(rect.left + dx);
            ySetterRef.current!(rect.top + dy);
            updateActiveDropZone(ev.clientX, ev.clientY);
        };

        const onUp = (ev: PointerEvent) => {
            const wasEngaged = engagedRef.current;
            const tappedIndex = pendingShopIndexRef.current;
            teardownListeners();

            if (wasEngaged) {
                const kind = targetKindRef.current;
                const zone = kind ? getShopDropZoneEl(kind) : null;
                const inZone = zone
                    ? rectContains(zone.getBoundingClientRect(), ev.clientX, ev.clientY)
                    : false;
                const cloneEl = getShopDragCloneEl();
                const cloneRect = cloneEl?.getBoundingClientRect()
                    ?? fromRectRef.current
                    ?? new DOMRect(ev.clientX, ev.clientY, 0, 0);

                if (inZone && isBuyable) {
                    // Don't play playDropRune here — the consumer's
                    // onDrop fires playBuy (and playOpenPack for packs),
                    // which is the meaningful "purchase" cue.
                    onDrop(shopIndex, itemType, cloneRect);
                } else {
                    // Soft "didn't take" cue. Pitch the drop SFX down
                    // so it reads as a non-confirmation vs. the
                    // standard pickup→drop you hear when reordering.
                    playDropRune(-200);
                }
            } else if (tappedIndex !== null) {
                // No engagement = quick tap or short hold-then-release.
                // Either way, fire onTap to open the tooltip.
                onTap(tappedIndex);
            }

            resetState();
            ev.preventDefault();
        };

        const onCancel = () => {
            teardownListeners();
            resetState();
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onCancel);
        cleanupRef.current = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onCancel);
        };

        // Stationary hold-to-engage timer. If movement hasn't engaged
        // drag by `HOLD_TO_ENGAGE_MS`, this fires and engages anyway —
        // gives the player the "I picked it up" affordance even when
        // they haven't moved yet. Cleared by teardownListeners on
        // pointerup/cancel/re-pointerdown.
        holdTimerRef.current = window.setTimeout(engageDrag, HOLD_TO_ENGAGE_MS);
    };

    return { onCardPointerDown };
}
