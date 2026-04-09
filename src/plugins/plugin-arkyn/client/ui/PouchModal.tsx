import { useEffect } from "react";
import { ELEMENT_TYPES, RUNES_PER_ELEMENT } from "../../shared";
import { useHand, usePouchContents } from "../arkynStore";
import { playMenuOpen } from "../sfx";
import RuneImage from "./RuneImage";
import { createPanelStyleVars } from "./styles";
import styles from "./PouchModal.module.css";

interface PouchModalProps {
    onClose: () => void;
}

const modalStyleVars = createPanelStyleVars();

// Each rune slot in the modal is one of three states. Pouch runes render at
// full opacity; drawn (in-hand) and spent (played/discarded) both render
// dimmed so the player can see the entire deck composition at a glance.
type SlotState = "pouch" | "drawn" | "spent";

// Three-letter element abbreviations shown in the side column. Order matches
// ELEMENT_TYPES so we can index by element name directly.
const ELEMENT_LABELS: Record<string, string> = {
    air: "AIR",
    arcane: "ARC",
    death: "DTH",
    earth: "EAR",
    fire: "FIR",
    holy: "HOL",
    ice: "ICE",
    lightning: "LIG",
    poison: "PSN",
    psy: "PSY",
    shadow: "SHD",
    steel: "STL",
    water: "WAT",
};

export default function PouchModal({ onClose }: PouchModalProps) {
    const pouchContents = usePouchContents();
    const hand = useHand();

    // Play the shared menu-open stinger once on mount.
    useEffect(() => {
        playMenuOpen();
    }, []);

    // Close on Escape.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

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
        <div className={styles.backdrop} onClick={onClose}>
            <div
                className={styles.modal}
                style={modalStyleVars}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={styles.header}>
                    <span className={styles.title}>Pouch</span>
                    <span className={styles.subtitle}>
                        {totalPouch} remaining · {totalHand} drawn · {totalSpent} spent
                    </span>
                    <button
                        type="button"
                        className={styles.closeButton}
                        onClick={onClose}
                        aria-label="Close pouch"
                    >
                        ×
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
                                    <span className={styles.elementLabel}>
                                        {ELEMENT_LABELS[element] ?? element.slice(0, 3).toUpperCase()}
                                    </span>
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
