import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    ARCANE_CLUSTER_ELEMENTS,
    AUGURY_PACK_RUNE_CHOICES,
    AUGURY_PACK_TAROT_CHOICES,
    BOSS_DEBUFFS,
    CASTS_PER_ROUND,
    DISCARDS_PER_ROUND,
    ELEMENT_TYPES,
    HAND_SIZE,
    MAX_CONSUMABLES,
    MAX_PLAY,
    MAX_SIGILS,
    PACK_DEFINITIONS,
    PACK_TYPES,
    RARITY_TYPES,
    SCROLL_RUNE_BONUS,
    SIGIL_DEFINITIONS,
    SIGIL_IDS,
    SPELL_TIER_BASE_DAMAGE,
    SPELL_TIER_MULT,
    SYNERGY_PAIRS,
    TAROT_DEFINITIONS,
    TAROT_IDS,
} from "../../shared";
import { COMBINABLE_ELEMENTS } from "../../shared/arkynConstants";
import { playMenuClose, playMenuOpen } from "../sfx";
import { renderDescription, SigilExplainer, SigilPenaltyLine, splitPenalty } from "./descriptionText";
import ItemScene from "./ItemScene";
import { getPackImageUrl } from "./packAssets";
import RuneImage from "./RuneImage";
import { getScrollImageUrl } from "./scrollAssets";
import {
    ARCANE_CLUSTER_COLOR,
    ELEMENTAL_CLUSTER_COLOR,
    ELEMENT_COLORS,
    INNER_FRAME_BGS,
    RARITY_COLORS,
    createPanelStyleVars,
} from "./styles";
import { getTarotImageUrl } from "./tarotAssets";
import closeIconUrl from "/assets/icons/close-64x64.png?url";
import closeHoverIconUrl from "/assets/icons/close-hover-64x64.png?url";
import criticalUrl from "/assets/ui/critical.png?url";
import styles from "./HowToPlayModal.module.css";

interface HowToPlayModalProps {
    onClose: () => void;
}

type Tab = "basics" | "scoring" | "combat" | "items" | "sigils" | "packs" | "scrolls" | "tarots";

interface TabEntry {
    id: Tab;
    label: string;
    /** Optional parent — child tabs render indented in the sidebar
     *  (visual subcategory under the parent's heading). */
    parent?: Tab;
}

const modalStyleVars: React.CSSProperties = {
    ...createPanelStyleVars(),
    "--tab-active-bg": INNER_FRAME_BGS.orange,
    "--accent-bg": INNER_FRAME_BGS.gold,
    "--max-bg": INNER_FRAME_BGS.green,
    "--weak-bg": INNER_FRAME_BGS.green,
    "--resist-bg": INNER_FRAME_BGS.red,
    "--boss-bg": INNER_FRAME_BGS.red,
} as React.CSSProperties;

// All default synergy pairs, sourced from `SYNERGY_PAIRS` in
// `shared/spellTable.ts` so this stays in sync with the actual cast
// resolver. Sigil-gated synergies (e.g. Burnrite's death+fire from
// `SIGIL_SYNERGY_PAIRS`) are intentionally excluded — those are
// rewards, not baseline knowledge.
const ALL_SYNERGY_PAIRS: [string, string][] = Array.from(SYNERGY_PAIRS).map(
    key => key.split("+") as [string, string],
);

const TABS: TabEntry[] = [
    { id: "basics", label: "Basics" },
    { id: "scoring", label: "Scoring" },
    { id: "combat", label: "Combat" },
    { id: "items", label: "Items" },
    { id: "sigils", label: "Sigils", parent: "items" },
    { id: "packs", label: "Packs", parent: "items" },
    { id: "scrolls", label: "Scrolls", parent: "items" },
    { id: "tarots", label: "Tarots" },
];

// Sigils sorted by rarity (Common → Legendary), then alphabetically by
// name within each rarity. Reads as a natural progression from the
// cheapest baseline sigils to the rarest endgame ones, instead of the
// arbitrary insertion order in `SIGIL_DEFINITIONS`.
const RARITY_ORDER: Record<string, number> = Object.fromEntries(
    RARITY_TYPES.map((r, i) => [r, i]),
);
const SIGIL_ORDER: string[] = SIGIL_IDS.slice().sort((a, b) => {
    const da = SIGIL_DEFINITIONS[a];
    const db = SIGIL_DEFINITIONS[b];
    const ra = RARITY_ORDER[da.rarity] ?? 99;
    const rb = RARITY_ORDER[db.rarity] ?? 99;
    if (ra !== rb) return ra - rb;
    return da.name.localeCompare(db.name);
});

// Tier data — mirrors the Grimoire so any future change to spell tier
// values flows through both modals without manual sync.
const TIER_DATA = [1, 2, 3, 4, 5].map(tier => ({
    tier,
    runes: tier,
    base: SPELL_TIER_BASE_DAMAGE[tier],
    mult: SPELL_TIER_MULT[tier],
}));

const RARITY_BASE_DAMAGE: { rarity: string; base: number }[] = [
    { rarity: "common", base: 8 },
    { rarity: "uncommon", base: 12 },
    { rarity: "rare", base: 18 },
    { rarity: "legendary", base: 30 },
];

// Sorted by Major Arcana number so the grid reads 0 → XXI.
const TAROT_ORDER: string[] = TAROT_IDS.slice().sort((a, b) => {
    const aNum = parseRoman(TAROT_DEFINITIONS[a].number);
    const bNum = parseRoman(TAROT_DEFINITIONS[b].number);
    return aNum - bNum;
});

export default function HowToPlayModal({ onClose }: HowToPlayModalProps) {
    const [tab, setTab] = useState<Tab>("basics");

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
                <div className={styles.header}>
                    <span className={styles.title}>How to Play</span>
                    <button
                        type="button"
                        className={styles.closeButton}
                        onClick={closeWithSfx}
                        aria-label="Close how to play"
                    >
                        <img src={closeIconUrl} alt="" className={styles.closeIcon} />
                        <img src={closeHoverIconUrl} alt="" className={styles.closeIconHover} />
                    </button>
                </div>

                <div className={styles.body}>
                    <div className={styles.sidebar}>
                        <nav className={styles.tabList}>
                            {TABS.map(t => {
                                const isChild = t.parent !== undefined;
                                return (
                                    <button
                                        key={t.id}
                                        type="button"
                                        className={`${styles.tab} ${isChild ? styles.tabChild : ""} ${tab === t.id ? styles.tabActive : ""}`}
                                        onClick={() => setTab(t.id)}
                                    >
                                        {isChild && <span className={styles.tabChildMarker} aria-hidden>↳</span>}
                                        {t.label}
                                    </button>
                                );
                            })}
                        </nav>
                    </div>

                    <div className={styles.content}>
                        {tab === "basics" && <BasicsTab />}
                        {tab === "scoring" && <ScoringTab />}
                        {tab === "combat" && <CombatTab />}
                        {tab === "items" && <ItemsTab />}
                        {tab === "sigils" && <SigilsTab />}
                        {tab === "packs" && <PacksTab />}
                        {tab === "scrolls" && <ScrollsTab />}
                        {tab === "tarots" && <TarotsTab />}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Basics ──

function BasicsTab() {
    return (
        <div className={styles.scrollArea}>
            <div className={styles.section}>
                <div className={styles.sectionHeading}>The Goal</div>
                <p className={styles.sectionText}>
                    You're a runecaster facing a procession of foes. Each round,
                    draw runes from your pouch, build a cast, and unleash a spell.
                    Survive long enough and the shop opens — buy <span className={styles.highlight}>Sigils</span>,
                    <span className={styles.highlight}> packs</span>, and
                    <span className={styles.highlight}> scrolls</span> to grow stronger.
                </p>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeading}>Round Flow</div>
                <div className={styles.statRow}>
                    <StatChip label="Hand" value={String(HAND_SIZE)} sub="runes" />
                    <StatChip label="Casts" value={String(CASTS_PER_ROUND)} sub="per round" />
                    <StatChip label="Discards" value={String(DISCARDS_PER_ROUND)} sub="per round" />
                    <StatChip label="Per Cast" value={`up to ${MAX_PLAY}`} sub="runes" />
                </div>
                <p className={styles.sectionText}>
                    Each round you draw <span className={styles.highlight}>{HAND_SIZE} runes</span>.
                    Pick up to <span className={styles.highlight}>{MAX_PLAY}</span> and cast,
                    or discard runes you don't want and redraw. The round ends when you
                    spend your last cast — kill the enemy before then or it's game over.
                </p>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeading}>The 13 Elements</div>
                <p className={styles.sectionText}>
                    Every rune belongs to one of thirteen elements, split across two
                    clusters. The clusters drive sigil interactions — synergy pairs
                    (below) work independently of clusters.
                </p>

                <div className={styles.subheading} style={{ color: ELEMENTAL_CLUSTER_COLOR }}>
                    Elemental Cluster
                </div>
                <p className={styles.sectionCaption}>
                    Combinable elements — eligible for the <span className={styles.highlight}>Fuze</span> sigil's loose-duo combo spells.
                </p>
                <div className={styles.elementGrid}>
                    {COMBINABLE_ELEMENTS.map(el => <ElementChip key={el} element={el} />)}
                </div>

                <div className={styles.subheading} style={{ color: ARCANE_CLUSTER_COLOR }}>
                    Arcane Cluster
                </div>
                <p className={styles.sectionCaption}>
                    Power <span className={styles.highlight}>Arcana</span>-style sigils that reward clustering these elements together.
                </p>
                <div className={styles.elementGrid}>
                    {ARCANE_CLUSTER_ELEMENTS.map(el => <ElementChip key={el} element={el} />)}
                </div>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeading}>Synergy Pairs</div>
                <p className={styles.sectionText}>
                    Specific element pairs trigger unique combo spells when played in
                    poker shapes — <span className={styles.highlight}>Two Pair</span> (2 + 2)
                    or <span className={styles.highlight}>Full House</span> (3 + 2).
                    These are the <span className={styles.highlight}>{ALL_SYNERGY_PAIRS.length}</span> default
                    synergies — they span both clusters:
                </p>
                <div className={styles.pairList}>
                    {ALL_SYNERGY_PAIRS.map(([a, b]) => (
                        <SynergyPair key={`${a}+${b}`} a={a} b={b} />
                    ))}
                </div>
                <p className={styles.sectionNote}>
                    Pairs not listed here cancel and the cast falls back to a single-element
                    spell based on whichever element dominates. Some sigils unlock additional
                    synergies (e.g. Burnrite enables Fire + Death) on top of the defaults.
                </p>
            </div>
        </div>
    );
}

// ── Scoring ──

function ScoringTab() {
    return (
        <div className={styles.scrollArea}>
            <div className={styles.section}>
                <div className={styles.sectionHeading}>The Formula</div>
                <p className={styles.sectionText}>
                    Every cast resolves into two numbers: <span className={styles.baseChip}>Base</span> and <span className={styles.multChip}>Mult</span>.
                    Damage is the product, then any <span className={styles.xmultChip}>xMult</span> applies at the very end.
                </p>
                <div className={styles.formulaCallout}>
                    <div className={styles.formulaRow}>
                        <span className={styles.totalChip}>Damage</span>
                        <span className={styles.formulaOp}>=</span>
                        <span className={styles.baseChip}>Base</span>
                        <span className={styles.formulaOp}>×</span>
                        <span className={styles.multChip}>Mult</span>
                        <span className={styles.formulaOp}>×</span>
                        <span className={styles.xmultChip}>xMult</span>
                    </div>
                    <p className={styles.sectionCaption}>
                        <span className={styles.baseChip}>Base</span> = Spell Tier base + each played rune's contribution.{" "}
                        <span className={styles.multChip}>Mult</span> = Spell Tier mult + sigil bonuses.{" "}
                        <span className={styles.xmultChip}>xMult</span> defaults to ×1.
                    </p>
                </div>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeading}>Spell Tiers</div>
                <p className={styles.sectionText}>
                    Playing more matching runes raises your <span className={styles.highlight}>tier</span>,
                    which adds flat <span className={styles.baseChip}>Base</span> and stacks <span className={styles.multChip}>Mult</span>.
                </p>
                <div className={styles.tierTable}>
                    <div className={styles.tierHeader}>
                        <span>Runes</span>
                        <span>Tier</span>
                        <span className={styles.tierColBase}>+ Base</span>
                        <span className={styles.tierColMult}>× Mult</span>
                    </div>
                    {TIER_DATA.map(t => (
                        <div key={t.tier} className={styles.tierRow}>
                            <span>{t.runes}</span>
                            <span className={styles.tierLabel}>{"I".repeat(t.tier)}</span>
                            <span className={styles.tierColBase}>+{t.base}</span>
                            <span className={styles.tierColMult}>×{t.mult}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeading}>Rune Contribution</div>
                <p className={styles.sectionText}>
                    Each contributing rune adds flat damage to <span className={styles.baseChip}>Base</span> by rarity:
                </p>
                <div className={styles.rarityTable}>
                    {RARITY_BASE_DAMAGE.map(r => (
                        <div key={r.rarity} className={styles.rarityRow}>
                            <span
                                className={styles.rarityName}
                                style={{ color: RARITY_COLORS[r.rarity] }}
                            >
                                {capitalize(r.rarity)}
                            </span>
                            <span className={styles.rarityBase}>+{r.base}</span>
                        </div>
                    ))}
                </div>
                <p className={styles.sectionNote}>
                    Each <span className={styles.highlight}>Scroll</span> level adds +{SCROLL_RUNE_BONUS} to its element's
                    rune contribution before weakness/resistance is applied.
                </p>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeading}>xMult</div>
                <p className={styles.sectionText}>
                    Some sigils grant <span className={styles.xmultChip}>xMult</span> — a final multiplier
                    that runs AFTER everything else. A 200-damage cast at <span className={styles.xmultChip}>×2</span> xMult
                    deals <span className={styles.highlight}>400</span>. Stacking xMult is the highest-leverage scaling in the game.
                </p>
            </div>
        </div>
    );
}

// ── Combat ──

function CombatTab() {
    return (
        <div className={styles.scrollArea}>
            <div className={styles.section}>
                <div className={styles.sectionHeading}>Weakness &amp; Resistance</div>
                <p className={styles.sectionText}>
                    Every enemy has a list of elements they're <span className={styles.weakLabel}>Weak</span> to
                    and elements they <span className={styles.resistLabel}>Resist</span>. These are shown as
                    chips on the enemy panel before each round.
                </p>

                <div className={styles.statusRow}>
                    <div className={styles.weakChip}>
                        <span className={styles.statusLabel}>Weak</span>
                        <span className={styles.statusValue}>×2</span>
                    </div>
                    <p className={styles.statusDesc}>
                        Runes of a weak element deal <span className={styles.weakLabel}>double</span> base damage.
                    </p>
                </div>

                <div className={styles.statusRow}>
                    <div className={styles.resistChip}>
                        <span className={styles.statusLabel}>Resist</span>
                        <span className={styles.statusValue}>×0.5</span>
                    </div>
                    <p className={styles.statusDesc}>
                        Runes of a resisted element deal <span className={styles.resistLabel}>half</span> base damage.
                    </p>
                </div>

                <p className={styles.sectionNote}>
                    Modifiers apply per-rune to <span className={styles.baseChip}>Base</span> only —
                    your <span className={styles.multChip}>Mult</span> is unaffected. Build hands that
                    match weaknesses; lean on neutral or weakness-matching elements when fighting resistant foes.
                </p>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeading}>Critical Hits</div>
                <div className={styles.critRow}>
                    <div className={styles.critPreview}>
                        <img src={criticalUrl} alt="" className={styles.critBubble} draggable={false} />
                        <span className={styles.critNumber}>-184</span>
                    </div>
                    <div className={styles.critBody}>
                        <p className={styles.sectionText}>
                            When your cast contains a rune that the enemy is <span className={styles.weakLabel}>Weak</span> to,
                            the hit lands as a <span className={styles.critLabel}>CRITICAL</span> — the
                            damage number pops with a red burst and a louder hit sound. Stack as many
                            weakness-matching runes as you can into a single cast for maximum payoff.
                        </p>
                    </div>
                </div>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeading}>Boss Rounds</div>
                <p className={styles.sectionText}>
                    Every <span className={styles.highlight}>5th round</span> (5, 10, 15…) is a boss.
                    Bosses have higher base HP and gain <span className={styles.highlight}>one debuff</span> for the fight:
                </p>
                <div className={styles.bossList}>
                    {BOSS_DEBUFFS.map(d => (
                        <div key={d.id} className={styles.bossRow}>
                            <span className={styles.bossName}>{d.name}</span>
                            <span className={styles.bossDesc}>{d.description}</span>
                        </div>
                    ))}
                </div>
                <p className={styles.sectionNote}>
                    The debuff is fixed by your run seed — replaying the same seed gives the
                    same boss debuff sequence.
                </p>
            </div>
        </div>
    );
}

// ── Items ──

function ItemsTab() {
    return (
        <div className={styles.scrollArea}>
            <div className={styles.section}>
                <div className={styles.sectionHeading}>Sigils</div>
                <p className={styles.sectionRow}>
                    <span className={styles.sectionPillMax}>Max {MAX_SIGILS}</span>
                    <span className={styles.sectionText}>
                        Permanent passive items bought from the shop. Some add flat <span className={styles.multChip}>Mult</span>,
                        some grant <span className={styles.xmultChip}>xMult</span>, others change your hand size, cast budget,
                        or how runes are scored. Sigils stack — see the <span className={styles.highlight}>Sigils</span> sub-tab
                        for the full list.
                    </span>
                </p>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeading}>Consumables</div>
                <p className={styles.sectionRow}>
                    <span className={styles.sectionPillMax}>Max {MAX_CONSUMABLES}</span>
                    <span className={styles.sectionText}>
                        One-shot items you can use mid-round. They trigger instantly —
                        good for finishing off a boss or rescuing a bad draw.
                    </span>
                </p>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeading}>Scrolls</div>
                <p className={styles.sectionText}>
                    Per-element upgrades. Each scroll level adds <span className={styles.highlight}>+{SCROLL_RUNE_BONUS} base damage</span> to
                    every rune of that element. See the <span className={styles.highlight}>Scrolls</span> sub-tab
                    for the full list.
                </p>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeading}>Packs</div>
                <p className={styles.sectionText}>
                    Deferred-pick shop items — buy a pack and a picker opens with a randomized
                    set, you keep one. Three pack types in play (Rune, Codex, <span className={styles.augury}>Augury</span>) —
                    see the <span className={styles.highlight}>Packs</span> sub-tab for what each one does.
                </p>
            </div>
        </div>
    );
}

// ── Tarots ──

function TarotsTab() {
    return (
        <div className={styles.scrollArea}>
            <div className={styles.section}>
                <div className={styles.sectionHeading}>Augury Pack Flow</div>
                <p className={styles.sectionText}>
                    An <span className={styles.augury}>Augury Pack</span> opens a special picker showing{" "}
                    <span className={styles.highlight}>{AUGURY_PACK_RUNE_CHOICES} runes</span> sampled from your pouch and{" "}
                    <span className={styles.highlight}>{AUGURY_PACK_TAROT_CHOICES} random Tarot cards</span>.
                    Pick up to 3 runes, choose one Tarot, then Apply — the Tarot transforms your selected runes,
                    and the other Tarots are discarded.
                </p>
                <p className={styles.sectionNote}>
                    Tarots can convert elements, upgrade rarity, fuse runes, banish for gold, duplicate,
                    or rework an entire element across your pouch. Some are pouch-wide and don't pick runes at all.
                </p>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeading}>The 22 Major Arcana</div>
                <p className={styles.sectionText}>
                    Hover any card to read its effect.
                </p>
                <div className={styles.tarotGrid}>
                    {TAROT_ORDER.map((id, i) => (
                        <TarotCard key={id} id={id} index={i} />
                    ))}
                </div>
            </div>
        </div>
    );
}

// Shared hook for ItemScene-card hover tooltips that need to escape
// the modal's .scrollArea overflow. Tracks viewport-anchored coords
// from the wrapped element's bounding rect, recomputes on capture-phase
// scroll / resize so the portaled tip follows the card if the player
// scrolls the modal while hovering.
function usePortalTipPosition() {
    const ref = useRef<HTMLDivElement>(null);
    const [hovered, setHovered] = useState(false);
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

    const update = useCallback(() => {
        const node = ref.current;
        if (!node) return;
        const rect = node.getBoundingClientRect();
        setPos({ left: rect.left + rect.width / 2, top: rect.top - 12 });
    }, []);

    useLayoutEffect(() => {
        if (!hovered) {
            setPos(null);
            return;
        }
        update();
    }, [hovered, update]);

    useEffect(() => {
        if (!hovered) return;
        const handler = () => update();
        // Capture phase catches scrolls on the .scrollArea ancestor too,
        // not just window — without it the tip stays anchored to the
        // card's old viewport position when the player scrolls the modal.
        window.addEventListener("scroll", handler, true);
        window.addEventListener("resize", handler);
        return () => {
            window.removeEventListener("scroll", handler, true);
            window.removeEventListener("resize", handler);
        };
    }, [hovered, update]);

    return { ref, hovered, setHovered, pos };
}

// Per-card wrapper that renders the in-game ItemScene tilt shader and
// portals its hover tooltip to <body>. Portaling fixes the previous
// clipping problem — the .scrollArea ancestor uses `overflow-y: auto`,
// which clips any in-flow tooltip that extends past its bounds.
interface TarotCardProps {
    id: string;
    index: number;
}

function TarotCard({ id, index }: TarotCardProps) {
    const def = TAROT_DEFINITIONS[id];
    const url = def ? getTarotImageUrl(def.fileBasename) : "";
    const { ref, hovered, setHovered, pos } = usePortalTipPosition();

    if (!def) return null;

    return (
        <>
            <div
                ref={ref}
                className={styles.tarotCard}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onFocus={() => setHovered(true)}
                onBlur={() => setHovered(false)}
                tabIndex={0}
                aria-label={def.name}
            >
                {url ? (
                    <ItemScene
                        itemId={id}
                        index={index}
                        imageUrl={url}
                        useFrame={false}
                        aspectRatio={1}
                        smoothIdle
                        className={styles.tarotCanvas}
                    />
                ) : (
                    <div className={styles.tarotPlaceholder}>{def.number}</div>
                )}
            </div>
            {hovered && pos && createPortal(
                <div className={styles.tarotPortalTip} style={pos}>
                    <span className={styles.tarotTipName}>{def.name}</span>
                    <div className={styles.tarotTipDescWrap}>
                        <span className={styles.tarotTipDesc}>
                            {renderDescription(def.description)}
                        </span>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}

// ── Sigils ──

function SigilsTab() {
    return (
        <div className={styles.scrollArea}>
            <div className={styles.section}>
                <div className={styles.sectionHeading}>Sigils</div>
                <p className={styles.sectionText}>
                    Sigils are <span className={styles.highlight}>permanent passive items</span> bought
                    from the shop. Some add flat <span className={styles.multChip}>Mult</span>, some grant{" "}
                    <span className={styles.xmultChip}>xMult</span>, others change your hand size, cast
                    budget, or how runes are scored. Build them up — synergies between sigils are the
                    core of every run.
                </p>
                <p className={styles.sectionNote}>
                    You can hold up to <span className={styles.highlight}>{MAX_SIGILS}</span> at once.
                    Hover any sigil for its full effect text.
                </p>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeading}>All Sigils ({SIGIL_ORDER.length})</div>
                <p className={styles.sectionCaption}>
                    Sorted by rarity — Common, Uncommon, Rare, Legendary.
                </p>
                <div className={styles.sigilGrid}>
                    {SIGIL_ORDER.map((id, i) => (
                        <SigilCard key={id} id={id} index={i} />
                    ))}
                </div>
            </div>
        </div>
    );
}

interface SigilCardProps {
    id: string;
    index: number;
}

function SigilCard({ id, index }: SigilCardProps) {
    const def = SIGIL_DEFINITIONS[id];
    const { ref, hovered, setHovered, pos } = usePortalTipPosition();

    if (!def) return null;

    const rarityColor = RARITY_COLORS[def.rarity] ?? "#b0b0b0";
    const { main, penalty } = splitPenalty(def.description);

    return (
        <>
            <div
                ref={ref}
                className={styles.sigilCard}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onFocus={() => setHovered(true)}
                onBlur={() => setHovered(false)}
                tabIndex={0}
                aria-label={def.name}
            >
                <ItemScene
                    itemId={id}
                    index={index}
                    smoothIdle
                    className={styles.sigilCanvas}
                />
            </div>
            {hovered && pos && createPortal(
                <div className={styles.tarotPortalTip} style={pos}>
                    <span className={styles.tarotTipName}>{def.name}</span>
                    <div className={styles.tarotTipDescWrap}>
                        <span className={styles.tarotTipDesc}>
                            {renderDescription(main)}
                        </span>
                        {penalty && <SigilPenaltyLine text={penalty} />}
                        {def.explainer && (
                            <SigilExplainer
                                label={def.explainer.label}
                                elements={def.explainer.elements}
                            />
                        )}
                    </div>
                    <span
                        className={styles.tipRarity}
                        style={{ backgroundColor: rarityColor }}
                    >
                        {def.rarity}
                    </span>
                </div>,
                document.body,
            )}
        </>
    );
}

// ── Packs ──

function PacksTab() {
    return (
        <div className={styles.scrollArea}>
            <div className={styles.section}>
                <div className={styles.sectionHeading}>Packs</div>
                <p className={styles.sectionText}>
                    Packs are <span className={styles.highlight}>deferred-pick</span> shop items.
                    Buy a pack and a picker opens — pick one item from a randomized set, the rest
                    are discarded. Packs always offer a choice; nothing is forced on you.
                </p>
                <p className={styles.sectionNote}>
                    Hover any pack for its full effect.
                </p>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeading}>All Packs ({PACK_TYPES.length})</div>
                <div className={styles.packGrid}>
                    {PACK_TYPES.map((id, i) => (
                        <PackCard key={id} id={id} index={i} />
                    ))}
                </div>
            </div>
        </div>
    );
}

interface PackCardProps {
    id: string;
    index: number;
}

function PackCard({ id, index }: PackCardProps) {
    const def = PACK_DEFINITIONS[id as keyof typeof PACK_DEFINITIONS];
    const url = def ? getPackImageUrl(id, 128) : "";
    const { ref, hovered, setHovered, pos } = usePortalTipPosition();

    if (!def) return null;

    return (
        <>
            <div
                ref={ref}
                className={styles.packCard}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onFocus={() => setHovered(true)}
                onBlur={() => setHovered(false)}
                tabIndex={0}
                aria-label={def.name}
            >
                {url ? (
                    <ItemScene
                        itemId={id}
                        index={index}
                        imageUrl={url}
                        useFrame={false}
                        aspectRatio={def.aspectRatio}
                        displayScale={def.displayScale}
                        smoothIdle
                        className={styles.packCanvas}
                    />
                ) : (
                    <div className={styles.tarotPlaceholder}>{def.name[0]}</div>
                )}
            </div>
            {hovered && pos && createPortal(
                <div className={styles.tarotPortalTip} style={pos}>
                    <span className={styles.tarotTipName}>{def.name}</span>
                    <div className={styles.tarotTipDescWrap}>
                        <span className={styles.tarotTipDesc}>
                            {renderDescription(def.description)}
                        </span>
                    </div>
                    <span className={styles.tipCost}>{def.cost} gold</span>
                </div>,
                document.body,
            )}
        </>
    );
}

// ── Scrolls ──

// Scrolls are per-element consumables. Description is synthesized here
// so the {+N Base} marker picks up the BASE_HIGHLIGHT_COLOR treatment
// from `renderDescription`, and the element name auto-colors via the
// shared element registry — the tooltip ends up reading like every
// other in-game scroll/sigil tooltip.
function buildScrollDescription(element: string): string {
    const cap = element.charAt(0).toUpperCase() + element.slice(1);
    return `Adds {+${SCROLL_RUNE_BONUS} Base} damage to ${cap} runes per scroll level.`;
}

function ScrollsTab() {
    return (
        <div className={styles.scrollArea}>
            <div className={styles.section}>
                <div className={styles.sectionHeading}>Scrolls</div>
                <p className={styles.sectionText}>
                    Scrolls are <span className={styles.highlight}>per-element upgrades</span>.
                    Each level on an element's scroll adds <span className={styles.baseChip}>+{SCROLL_RUNE_BONUS} Base</span>{" "}
                    damage to every rune of that element, applied before weakness / resistance.
                    Stack scrolls on a single element to push its rune contribution well past the
                    rarity baseline.
                </p>
                <p className={styles.sectionNote}>
                    Found in the shop and via Codex Packs. Hover any scroll for its effect.
                </p>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeading}>All Scrolls ({ELEMENT_TYPES.length})</div>
                <div className={styles.scrollGrid}>
                    {ELEMENT_TYPES.map((el, i) => (
                        <ScrollCard key={el} element={el} index={i} />
                    ))}
                </div>
            </div>
        </div>
    );
}

interface ScrollCardProps {
    element: string;
    index: number;
}

function ScrollCard({ element, index }: ScrollCardProps) {
    const url = getScrollImageUrl(element);
    const { ref, hovered, setHovered, pos } = usePortalTipPosition();
    const cap = element.charAt(0).toUpperCase() + element.slice(1);
    const name = `${cap} Scroll`;
    const desc = buildScrollDescription(element);

    return (
        <>
            <div
                ref={ref}
                className={styles.scrollCard}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                onFocus={() => setHovered(true)}
                onBlur={() => setHovered(false)}
                tabIndex={0}
                aria-label={name}
            >
                {url ? (
                    <ItemScene
                        itemId={`scroll-${element}`}
                        index={index}
                        imageUrl={url}
                        useFrame={false}
                        aspectRatio={1}
                        smoothIdle
                        className={styles.scrollCanvas}
                    />
                ) : (
                    <div className={styles.tarotPlaceholder}>{cap[0]}</div>
                )}
            </div>
            {hovered && pos && createPortal(
                <div className={styles.tarotPortalTip} style={pos}>
                    <span className={styles.tarotTipName}>{name}</span>
                    <div className={styles.tarotTipDescWrap}>
                        <span className={styles.tarotTipDesc}>
                            {renderDescription(desc)}
                        </span>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}

// ── Small reusable bits ──

function StatChip({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className={styles.statChip}>
            <span className={styles.statValue}>{value}</span>
            <span className={styles.statLabel}>{label}</span>
            {sub && <span className={styles.statSub}>{sub}</span>}
        </div>
    );
}

function ElementChip({ element }: { element: string }) {
    const color = ELEMENT_COLORS[element] ?? "#e8d4b8";
    return (
        <div className={styles.elementCell}>
            <div className={styles.runeSlot}>
                <RuneImage rarity="common" element={element} className={styles.runeLayer} />
            </div>
            <span className={styles.elementLabel} style={{ color }}>
                {capitalize(element)}
            </span>
        </div>
    );
}

function SynergyPair({ a, b }: { a: string; b: string }) {
    const colorA = ELEMENT_COLORS[a] ?? "#e8d4b8";
    const colorB = ELEMENT_COLORS[b] ?? "#e8d4b8";
    return (
        <div className={styles.pairCell}>
            <div className={styles.pairRunes}>
                <div className={styles.runeSlotSm}>
                    <RuneImage rarity="common" element={a} className={styles.runeLayer} />
                </div>
                <span className={styles.pairPlus}>+</span>
                <div className={styles.runeSlotSm}>
                    <RuneImage rarity="common" element={b} className={styles.runeLayer} />
                </div>
            </div>
            <div className={styles.pairLabel}>
                <span style={{ color: colorA }}>{capitalize(a)}</span>
                <span className={styles.pairLabelPlus}>+</span>
                <span style={{ color: colorB }}>{capitalize(b)}</span>
            </div>
        </div>
    );
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// Convert a Roman-numeral or Arabic-digit string to a number for sorting
// the Major Arcana by their canonical order (0 → XXI). Tarot definitions
// use mixed forms ("0", "I", "II", "VIII", "XXI"), so a tiny parser keeps
// the sort stable without per-tarot ordinal fields.
function parseRoman(s: string): number {
    if (/^\d+$/.test(s)) return Number(s);
    const map: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 };
    let total = 0;
    for (let i = 0; i < s.length; i++) {
        const cur = map[s[i]] ?? 0;
        const next = map[s[i + 1]] ?? 0;
        total += cur < next ? -cur : cur;
    }
    return total;
}
