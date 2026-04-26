import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { gsap } from "gsap";
import {
    sendReady,
    sendBuyItem,
    sendRerollShop,
    useShopItems,
    useGold,
    usePendingBagRunes,
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
import { playButton, playBuy, playOpenPack } from "../sfx";
import { RARITY_COLORS, createPanelStyleVars } from "./styles";
import { getPackImageUrl } from "./packAssets";
import ItemScene from "./ItemScene";
import Tooltip from "./Tooltip";
import RuneBagPicker from "./RuneBagPicker";
import CodexPicker from "./CodexPicker";
import AuguryPicker from "./AuguryPicker";
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
    const pendingBagRunes = usePendingBagRunes();
    const pendingCodexScrolls = usePendingCodexScrolls();
    const pendingAuguryRunes = usePendingAuguryRunes();
    const pendingAuguryTarots = usePendingAuguryTarots();
    const packAnimating = usePackAnimating();
    const sigils = useSigils();
    const sigilBarFull = sigils.length >= MAX_SIGILS;

    const panelRef = useRef<HTMLDivElement>(null);
    const shopContentRef = useRef<HTMLDivElement>(null);
    const pickerContentRef = useRef<HTMLDivElement>(null);
    const [selectedShopIndex, setSelectedShopIndex] = useState<number | null>(null);

    // `renderedMode` lags the live picker state during exit animations so
    // React keeps the outgoing element mounted while GSAP slides it out.
    // Same pattern used by ArkynOverlay's shop <-> playing swap. The
    // picker is gated on `packAnimating` so it doesn't slide in mid
    // pack-fly+dissolve animation (the schema sync that populates
    // `pendingX` may arrive before the animation finishes).
    const hasPendingPicker =
        pendingBagRunes.length > 0 ||
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
    // through to `<RuneBagPicker runes={[]} />` while `renderedMode` is
    // still "picker" — its action panel ("Choose one rune to add to
    // your pouch") would briefly pop in before the wrapper exit fades
    // the picker away. Latching the type means the original picker
    // keeps rendering (with its now-empty arrays — its bottom UI stays
    // locked invisible from its own exit timeline) until renderedMode
    // flips to "shop" and unmounts it cleanly.
    type PickerType = "augury" | "codex" | "rune-bag";
    const [activePickerType, setActivePickerType] = useState<PickerType | null>(() => {
        if (pendingAuguryRunes.length > 0) return "augury";
        if (pendingCodexScrolls.length > 0) return "codex";
        if (pendingBagRunes.length > 0) return "rune-bag";
        return null;
    });
    useEffect(() => {
        // Only LATCH when a pending array becomes non-empty. The
        // empty-everywhere case is the exit transition — leave the
        // type alone so the picker keeps rendering until renderedMode
        // unmounts it.
        if (pendingAuguryRunes.length > 0) setActivePickerType("augury");
        else if (pendingCodexScrolls.length > 0) setActivePickerType("codex");
        else if (pendingBagRunes.length > 0) setActivePickerType("rune-bag");
    }, [pendingAuguryRunes.length, pendingCodexScrolls.length, pendingBagRunes.length]);
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

    const handleBuyPack = (shopIndex: number, packId: PackType, e: React.MouseEvent) => {
        e.stopPropagation();
        const def = PACK_DEFINITIONS[packId];
        if (!def) return;
        const card = (e.currentTarget as HTMLElement).closest(`.${styles.itemCard}`);
        const canvas = card?.querySelector(`.${styles.sigilCanvas}`) as HTMLElement | null;
        const fromRect = canvas?.getBoundingClientRect() ?? new DOMRect(
            window.innerWidth / 2, window.innerHeight / 2, 0, 0,
        );
        // Flip the gate BEFORE sending the buy so the schema-synced
        // `pendingX` array doesn't trigger an early picker mount.
        // ArkynOverlay's pack-fly timeline flips it back off on cleanup.
        setPackAnimating(true);
        emitPackPurchase({
            packId,
            imageUrl: getPackImageUrl(packId, 128),
            fromRect,
            naturalAspect: def.aspectRatio,
            dissolveElement: def.dissolveElement,
        });
        sendBuyItem(shopIndex);
        // Tarot/scroll packs swap the generic buy chime for the
        // open-pack SFX — the sound is the player's first cue that
        // a picker is about to mount, so the more thematic "rip" reads
        // as the pack itself opening rather than a regular purchase.
        // Rune Bag keeps playBuy since it isn't a sealed pack visually.
        if (packId === "auguryPack" || packId === "codexPack") {
            playOpenPack();
        } else {
            playBuy();
        }
        setSelectedShopIndex(null);
    };

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
        <div ref={panelRef} className={styles.panel} style={panelStyleVars}>
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

            {/* Packs section — Rune Bags, Codex Packs, future packs. */}
            <span className={styles.sectionLabel}>Packs</span>
            <div className={`${styles.section} ${styles.consumablesSection}`}>
                <div className={styles.itemGrid}>
                    {packItems.map((item, i) => {
                        const packId = item.itemType as PackType;
                        const def = PACK_DEFINITIONS[packId];
                        if (!def) return null;
                        const canAfford = gold >= item.cost;
                        const isSelected = selectedShopIndex === item.shopIndex;
                        const tooltipPlacement = i < packItems.length / 2 ? "left" : "right";
                        const packImageUrl = getPackImageUrl(packId, 128);

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
                                        itemId={packId}
                                        index={sigilItems.length + i}
                                        imageUrl={packImageUrl}
                                        useFrame={false}
                                        aspectRatio={def.aspectRatio}
                                        displayScale={def.displayScale}
                                        className={styles.sigilCanvas}
                                    />
                                    {isSelected && (
                                        <button
                                            type="button"
                                            className={styles.buyButton}
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

                                <Tooltip placement={tooltipPlacement} arrow variant="framed">
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

        {renderedMode === "picker" && activePickerType !== null && (
            activePickerType === "augury"
                ? <AuguryPicker ref={pickerContentRef} runes={pendingAuguryRunes} tarotIds={pendingAuguryTarots} />
            : activePickerType === "codex"
                ? <CodexPicker ref={pickerContentRef} scrolls={pendingCodexScrolls} />
                : <RuneBagPicker ref={pickerContentRef} runes={pendingBagRunes} />
        )}
        </div>
    );
}
