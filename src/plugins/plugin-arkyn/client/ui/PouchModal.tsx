import { useCallback, useEffect } from "react";
import { ELEMENT_TYPES, RUNES_PER_ELEMENT } from "../../shared";
import { useHand, usePouchContents, type RuneClientData } from "../arkynStore";
import { playMenuClose, playMenuOpen } from "../sfx";
import RuneImage from "./RuneImage";
import { getRuneImageUrl } from "./runeAssets";
import { createPanelStyleVars } from "./styles";
import { useAcquiredRuneStats } from "./hooks/useAcquiredRuneStats";
import closeIconUrl from "/assets/icons/close-64x64.png?url";
import closeHoverIconUrl from "/assets/icons/close-hover-64x64.png?url";
import styles from "./PouchModal.module.css";

interface PouchModalProps {
    onClose: () => void;
}

const modalStyleVars = createPanelStyleVars();

// Each rune slot in the modal is one of three states. Pouch runes render at
// full opacity; drawn (in-hand) and spent (played/discarded) both render
// dimmed so the player can see the entire deck composition at a glance.
type SlotState = "pouch" | "drawn" | "spent";


export default function PouchModal({ onClose }: PouchModalProps) {
    const pouchContents = usePouchContents();
    const hand = useHand();
    const { bonusByElement, banishedByElement, totalAll } = useAcquiredRuneStats();

    // Play the shared menu-open stinger once on mount.
    useEffect(() => {
        playMenuOpen();
    }, []);

    // Wrap onClose so every dismiss path (backdrop click, Escape, X
    // button) plays the menu-close stinger without each call site having
    // to remember to fire it.
    const closeWithSfx = useCallback(() => {
        playMenuClose();
        onClose();
    }, [onClose]);

    // Close on Escape.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") closeWithSfx();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [closeWithSfx]);

    // Bucket pouch + hand runes per element so we can render their real
    // rarity art (not just common). The deck grows past the base 52 via
    // Rune Pack picks and Magic Mirror duplicates — each acquired rune
    // adds one extra slot to its element's row (see useAcquiredRuneStats).
    const pouchByElement = new Map<string, RuneClientData[]>();
    for (const r of pouchContents) {
        const list = pouchByElement.get(r.element) ?? [];
        list.push(r);
        pouchByElement.set(r.element, list);
    }
    const handByElement = new Map<string, RuneClientData[]>();
    for (const r of hand) {
        const list = handByElement.get(r.element) ?? [];
        list.push(r);
        handByElement.set(r.element, list);
    }

    const totalPouch = pouchContents.length;
    const totalHand = hand.length;
    const totalSpent = totalAll - totalPouch - totalHand;

    return (
        <div className={styles.backdrop} onClick={closeWithSfx}>
            <div
                className={styles.modal}
                style={modalStyleVars}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={styles.header}>
                    <span className={styles.title}>Spellbook</span>
                    <span className={styles.subtitle}>
                        <span className={styles.subtitleRemaining}>{totalPouch} remaining</span>
                        {" · "}
                        <span className={styles.subtitleDrawn}>{totalHand} drawn</span>
                        {" · "}
                        <span className={styles.subtitleSpent}>{totalSpent} spent</span>
                    </span>
                    <button
                        type="button"
                        className={styles.closeButton}
                        onClick={closeWithSfx}
                        aria-label="Close spellbook"
                    >
                        <img src={closeIconUrl} alt="" className={styles.closeIcon} />
                        <img src={closeHoverIconUrl} alt="" className={styles.closeIconHover} />
                    </button>
                </div>

                <div className={styles.body}>
                    <div className={styles.elementColumn}>
                        {ELEMENT_TYPES.map(element => {
                            const remaining =
                                (pouchByElement.get(element)?.length ?? 0) +
                                (handByElement.get(element)?.length ?? 0);
                            const empty = remaining === 0;
                            return (
                                <div
                                    key={element}
                                    className={`${styles.elementRow} ${empty ? styles.elementRowEmpty : ""}`}
                                >
                                    <img
                                        src={getRuneImageUrl(element)}
                                        alt={element}
                                        className={styles.elementIcon}
                                    />
                                    <span className={styles.elementCount}>{remaining}</span>
                                </div>
                            );
                        })}
                    </div>

                    <div className={styles.grid}>
                        {ELEMENT_TYPES.flatMap(element => {
                            const pouchRunes = pouchByElement.get(element) ?? [];
                            const handRunes = handByElement.get(element) ?? [];
                            // Total slots for this element = base 4 + acquired − banished.
                            // Subtracting banished is critical: tarot conversions /
                            // Banish sigil / Lovers fuse all push to banishedRunes,
                            // and without this subtract the banished slots paint as
                            // phantom "spent" runes in the grid (e.g. Emperor
                            // converting 2 Lightning → 2 Earth would still show 4
                            // Lightning slots with 2 dimmed even though they no
                            // longer exist in the deck).
                            const totalForElement =
                                RUNES_PER_ELEMENT
                                + (bonusByElement.get(element) ?? 0)
                                - (banishedByElement.get(element) ?? 0);
                            const spent = Math.max(0, totalForElement - pouchRunes.length - handRunes.length);

                            // Render in three bands: pouch (lit, real rarity),
                            // drawn (dimmed, real rarity), spent (dimmed).
                            //
                            // Limitation: the server doesn't retain which
                            // specific rune was played/discarded, so spent
                            // slots fall back to common art. If a player
                            // picked a rare rune and it got spent, its slot
                            // renders as common until next round — acceptable
                            // for v1.
                            const icons = [];
                            for (let i = 0; i < pouchRunes.length; i++) {
                                icons.push(
                                    <RuneIcon
                                        key={`${element}-p-${i}`}
                                        element={element}
                                        rarity={pouchRunes[i].rarity}
                                        state="pouch"
                                    />,
                                );
                            }
                            for (let i = 0; i < handRunes.length; i++) {
                                icons.push(
                                    <RuneIcon
                                        key={`${element}-h-${i}`}
                                        element={element}
                                        rarity={handRunes[i].rarity}
                                        state="drawn"
                                    />,
                                );
                            }
                            for (let i = 0; i < spent; i++) {
                                icons.push(
                                    <RuneIcon
                                        key={`${element}-s-${i}`}
                                        element={element}
                                        rarity="common"
                                        state="spent"
                                    />,
                                );
                            }
                            return icons;
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

function RuneIcon({ element, rarity, state }: { element: string; rarity: string; state: SlotState }) {
    const dimmed = state !== "pouch";
    return (
        <div className={`${styles.rune} ${dimmed ? styles.dimmed : ""}`}>
            <RuneImage rarity={rarity} element={element} className={styles.runeLayer} />
        </div>
    );
}
