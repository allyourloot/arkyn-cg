import { useCallback, useEffect } from "react";
import { ELEMENT_TYPES, RUNES_PER_ELEMENT } from "../../shared";
import { useHand, usePouchContents } from "../arkynStore";
import { playMenuClose, playMenuOpen } from "../sfx";
import RuneImage from "./RuneImage";
import { getRuneImageUrl } from "./runeAssets";
import { createPanelStyleVars } from "./styles";
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

    // Count pouch + hand runes per element. Each element starts with exactly
    // RUNES_PER_ELEMENT copies, so any missing slot is "spent" (played or
    // discarded earlier this round).
    const pouchByElement = new Map<string, number>();
    for (const r of pouchContents) {
        pouchByElement.set(r.element, (pouchByElement.get(r.element) ?? 0) + 1);
    }
    const handByElement = new Map<string, number>();
    for (const r of hand) {
        handByElement.set(r.element, (handByElement.get(r.element) ?? 0) + 1);
    }

    const totalPouch = pouchContents.length;
    const totalHand = hand.length;
    const totalSpent = ELEMENT_TYPES.length * RUNES_PER_ELEMENT - totalPouch - totalHand;

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
                                (pouchByElement.get(element) ?? 0) +
                                (handByElement.get(element) ?? 0);
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
                            const inPouch = pouchByElement.get(element) ?? 0;
                            const inHand = handByElement.get(element) ?? 0;
                            const spent = Math.max(0, RUNES_PER_ELEMENT - inPouch - inHand);

                            // Build the slot list: pouch first (lit), then drawn,
                            // then spent — both dimmed.
                            const slots: SlotState[] = [];
                            for (let i = 0; i < inPouch; i++) slots.push("pouch");
                            for (let i = 0; i < inHand; i++) slots.push("drawn");
                            for (let i = 0; i < spent; i++) slots.push("spent");

                            return slots.map((state, i) => (
                                <RuneIcon
                                    key={`${element}-${i}`}
                                    element={element}
                                    state={state}
                                />
                            ));
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

function RuneIcon({ element, state }: { element: string; state: SlotState }) {
    const dimmed = state !== "pouch";
    return (
        <div className={`${styles.rune} ${dimmed ? styles.dimmed : ""}`}>
            <RuneImage rarity="common" element={element} className={styles.runeLayer} />
        </div>
    );
}
