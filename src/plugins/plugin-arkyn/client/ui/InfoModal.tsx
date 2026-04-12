import { useCallback, useEffect, useState } from "react";
import { TWO_PAIR_TABLE, FULL_HOUSE_TABLE, SPELL_TIER_BASE_DAMAGE, SPELL_TIER_MULT } from "../../shared";
import { playMenuClose, playMenuOpen } from "../sfx";
import RuneImage from "./RuneImage";
import { createPanelStyleVars, ELEMENT_COLORS } from "./styles";
import closeIconUrl from "/assets/icons/close-64x64.png?url";
import closeHoverIconUrl from "/assets/icons/close-hover-64x64.png?url";
import innerFrameOrangeUrl from "/assets/ui/inner-frame-orange.png?url";
import styles from "./InfoModal.module.css";

interface InfoModalProps {
    onClose: () => void;
}

type Tab = "synergies" | "spells";

const modalStyleVars: React.CSSProperties = {
    ...createPanelStyleVars(),
    "--tab-active-bg": `url(${innerFrameOrangeUrl})`,
} as React.CSSProperties;

// Parse SYNERGY_PAIRS into structured data for display, grouped by cluster.
interface SynergyEntry {
    a: string;
    b: string;
    key: string; // alphabetically sorted "a+b"
    twoPairName: string;
    fullHouseNameAB: string; // 3-of-a + 2-of-b
    fullHouseNameBA: string; // 3-of-b + 2-of-a
}

const STORM_CLUSTER_PAIRS = [
    "fire+lightning", "earth+fire", "fire+holy", "air+fire",
    "ice+water", "lightning+water", "poison+water",
    "earth+steel", "earth+ice", "earth+poison",
    "air+lightning", "air+ice", "air+water",
    "death+ice", "lightning+steel",
];

const ARCANE_CLUSTER_PAIRS = [
    "arcane+psy", "arcane+shadow", "arcane+holy",
    "death+poison", "death+shadow",
    "holy+shadow", "psy+shadow", "psy+steel",
];

function buildEntries(keys: string[]): SynergyEntry[] {
    return keys.map(key => {
        const [a, b] = key.split("+");
        const twoPair = TWO_PAIR_TABLE[key];
        const fhAB = FULL_HOUSE_TABLE[`${a}+${b}`];
        const fhBA = FULL_HOUSE_TABLE[`${b}+${a}`];
        return {
            a,
            b,
            key,
            twoPairName: twoPair?.name ?? "",
            fullHouseNameAB: fhAB?.name ?? "",
            fullHouseNameBA: fhBA?.name ?? "",
        };
    });
}

const stormEntries = buildEntries(STORM_CLUSTER_PAIRS);
const arcaneEntries = buildEntries(ARCANE_CLUSTER_PAIRS);

// Spell tier data for the explanation tab.
const TIER_DATA = [1, 2, 3, 4, 5].map(tier => ({
    tier,
    runes: tier,
    base: SPELL_TIER_BASE_DAMAGE[tier],
    mult: SPELL_TIER_MULT[tier],
}));

export default function InfoModal({ onClose }: InfoModalProps) {
    const [tab, setTab] = useState<Tab>("synergies");

    useEffect(() => {
        playMenuOpen();
    }, []);

    const closeWithSfx = useCallback(() => {
        playMenuClose();
        onClose();
    }, [onClose]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") closeWithSfx();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [closeWithSfx]);

    return (
        <div className={styles.backdrop} onClick={closeWithSfx}>
            <div
                className={styles.modal}
                style={modalStyleVars}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className={styles.header}>
                    <span className={styles.title}>Grimoire</span>
                    <button
                        type="button"
                        className={styles.closeButton}
                        onClick={closeWithSfx}
                        aria-label="Close info"
                    >
                        <img src={closeIconUrl} alt="" className={styles.closeIcon} />
                        <img src={closeHoverIconUrl} alt="" className={styles.closeIconHover} />
                    </button>
                </div>

                {/* Body: sidebar tabs + content */}
                <div className={styles.body}>
                    <div className={styles.sidebar}>
                        <nav className={styles.tabList}>
                            <button
                                type="button"
                                className={`${styles.tab} ${tab === "synergies" ? styles.tabActive : ""}`}
                                onClick={() => setTab("synergies")}
                            >
                                Synergies
                            </button>
                            <button
                                type="button"
                                className={`${styles.tab} ${tab === "spells" ? styles.tabActive : ""}`}
                                onClick={() => setTab("spells")}
                            >
                                Spell Tiers
                            </button>
                        </nav>
                    </div>

                    <div className={styles.content}>
                        {tab === "synergies" ? <SynergiesTab /> : <SpellTiersTab />}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Synergies Tab ──

function SynergyRow({ entry }: { entry: SynergyEntry }) {
    const colorA = ELEMENT_COLORS[entry.a] ?? "#e8d4b8";
    const colorB = ELEMENT_COLORS[entry.b] ?? "#e8d4b8";
    return (
        <div className={styles.synergyRow}>
            <div className={styles.synergyPair}>
                <div className={styles.runeSlot}>
                    <RuneImage rarity="common" element={entry.a} className={styles.runeLayer} />
                </div>
                <span className={styles.synergyPlus}>+</span>
                <div className={styles.runeSlot}>
                    <RuneImage rarity="common" element={entry.b} className={styles.runeLayer} />
                </div>
            </div>
            <div className={styles.synergyInfo}>
                <span className={styles.synergyElements}>
                    <span style={{ color: colorA }}>{capitalize(entry.a)}</span>
                    {" + "}
                    <span style={{ color: colorB }}>{capitalize(entry.b)}</span>
                </span>
                <span className={styles.synergySpells}>
                    <span className={styles.synergyShape}>2+2</span> {entry.twoPairName}
                    <span className={styles.synergyDivider}>|</span>
                    <span className={styles.synergyShape}>3+2</span> {entry.fullHouseNameAB}
                    <span className={styles.synergyDivider}>|</span>
                    <span className={styles.synergyShape}>3+2</span> {entry.fullHouseNameBA}
                </span>
            </div>
        </div>
    );
}

function SynergiesTab() {
    return (
        <div className={styles.scrollArea}>
            <div className={styles.section}>
                <p className={styles.sectionIntro}>
                    Certain element pairs are <span className={styles.highlight}>synergy-kin</span> — playing
                    them together in specific shapes unlocks powerful combo spells. Pairs not
                    listed here will fall back to single-element spells.
                </p>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeading}>Elemental Cluster</div>
                <div className={styles.synergyList}>
                    {stormEntries.map(e => <SynergyRow key={e.key} entry={e} />)}
                </div>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeading}>Arcane Cluster</div>
                <div className={styles.synergyList}>
                    {arcaneEntries.map(e => <SynergyRow key={e.key} entry={e} />)}
                </div>
            </div>

            <div className={styles.section}>
                <p className={styles.sectionNote}>
                    Not all element pairings have synergies yet. Future shop items may
                    unlock new fusion types — including loose duo combos for any
                    two-element cast.
                </p>
            </div>
        </div>
    );
}

// ── Spell Tiers Tab ──

function SpellTiersTab() {
    return (
        <div className={styles.scrollArea}>
            <div className={styles.section}>
                <div className={styles.sectionHeading}>Single Element Spells</div>
                <p className={styles.sectionText}>
                    Playing 1 to 5 runes of the <span className={styles.highlight}>same element</span> produces
                    increasingly powerful spells. More runes = higher tier.
                </p>
                <div className={styles.tierTable}>
                    <div className={styles.tierHeader}>
                        <span>Runes</span>
                        <span>Tier</span>
                        <span className={styles.tierColBase}>Base</span>
                        <span className={styles.tierColMult}>Mult</span>
                    </div>
                    {TIER_DATA.map(t => (
                        <div key={t.tier} className={styles.tierRow}>
                            <span>{t.runes}</span>
                            <span className={styles.tierLabel}>{"I".repeat(t.tier)}</span>
                            <span className={styles.tierColBase}>+{t.base}</span>
                            <span className={styles.tierColMult}>x{t.mult}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeading}>Combo Shapes</div>
                <p className={styles.sectionText}>
                    When synergy-kin elements are played in <span className={styles.highlight}>poker shapes</span>,
                    they fuse into unique combo spells instead of falling back to single-element.
                </p>
                <div className={styles.comboList}>
                    <div className={styles.comboEntry}>
                        <span className={styles.comboShape}>Two Pair</span>
                        <span className={styles.comboDesc}>
                            2 + 2 of a synergy pair = Tier IV combo spell.
                            All 4 runes contribute. A 5th rune of any element
                            can be added as a kicker (consumed but doesn't add damage).
                        </span>
                    </div>
                    <div className={styles.comboEntry}>
                        <span className={styles.comboShape}>Full House</span>
                        <span className={styles.comboDesc}>
                            3 + 2 of a synergy pair = Tier V combo spell.
                            All 5 runes contribute. The 3-of element determines the
                            spell variant — swapping which element is 3-of vs 2-of
                            gives a different spell.
                        </span>
                    </div>
                </div>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeading}>Damage Formula</div>
                <p className={styles.sectionText}>
                    Each cast resolves into <span className={styles.baseChip}>Base</span> and <span className={styles.multChip}>Mult</span>:
                </p>
                <div className={styles.formula}>
                    <span className={styles.baseChip}>Base</span>
                    <span className={styles.formulaOp}>=</span>
                    <span>Spell Tier Base + Each Rune's Damage</span>
                </div>
                <div className={styles.formula}>
                    <span className={styles.totalChip}>Total</span>
                    <span className={styles.formulaOp}>=</span>
                    <span className={styles.baseChip}>Base</span>
                    <span className={styles.formulaOp}>x</span>
                    <span className={styles.multChip}>Mult</span>
                </div>
                <p className={styles.sectionText}>
                    Each contributing rune adds <span className={styles.highlight}>8 base damage</span>, modified
                    by enemy weakness (<span style={{ color: "#4ade80" }}>x1.5</span>) or
                    resistance (<span style={{ color: "#ef4444" }}>x0.5</span>).
                    Non-contributing runes are consumed but deal no damage.
                </p>
            </div>

            <div className={styles.section}>
                <p className={styles.sectionNote}>
                    Higher-tier spells scale dramatically — a Tier V spell with 5
                    contributing runes against a weakness deals massive damage thanks to
                    the x5 multiplier. Build your hand around synergy pairs to unlock the
                    strongest combos.
                </p>
            </div>
        </div>
    );
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
