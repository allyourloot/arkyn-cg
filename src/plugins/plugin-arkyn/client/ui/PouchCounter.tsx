import { useState } from "react";
import { DEFAULT_SPELLBOOK_ID, POUCH_SIZE, SPELLBOOKS } from "../../shared";
import { usePouchSize, useAcquiredRunes, useBanishedRunes } from "../arkynStore";
import PouchModal from "./PouchModal";
import { getSpellbookImageUrl } from "./spellbookAssets";
import { createPanelStyleVars } from "./styles";
import styles from "./PouchCounter.module.css";

// `--panel-bg` (frame.png) is consumed by .count's border-image so the
// number sits inside the same 9-slice chrome other panels use.
const panelStyleVars = createPanelStyleVars();

export default function PouchCounter() {
    const pouchSize = usePouchSize();
    const acquiredRunes = useAcquiredRunes();
    const banishedRunes = useBanishedRunes();
    // The equipped spellbook is hardcoded to Standard for now. Once players
    // can choose a spellbook (and modifiers come into play), this should
    // read from ArkynPlayerState instead.
    const spellbook = SPELLBOOKS[DEFAULT_SPELLBOOK_ID];
    const spellbookUrl = getSpellbookImageUrl(spellbook.id);
    // Total deck size grows past POUCH_SIZE as the player picks runes from
    // Rune Bags or duplicates them via Magic Mirror (both funnel into
    // `acquiredRunes` as permanent-across-rounds additions) and shrinks
    // as Banish destroys them.
    const deckSize = POUCH_SIZE + acquiredRunes.length - banishedRunes.length;
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                type="button"
                data-pouch-counter
                className={styles.wrapper}
                style={panelStyleVars}
                onClick={() => setIsOpen(true)}
                aria-label={`Open ${spellbook.name} spellbook`}
            >
                {spellbookUrl && (
                    <img src={spellbookUrl} alt={spellbook.name} className={styles.icon} />
                )}
                <span className={styles.count}>{pouchSize}/{deckSize}</span>
            </button>
            {isOpen && <PouchModal onClose={() => setIsOpen(false)} />}
        </>
    );
}
