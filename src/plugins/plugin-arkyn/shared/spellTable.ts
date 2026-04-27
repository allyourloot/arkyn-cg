import type { ElementType, RarityType } from "./arkynConstants";
import { expandMimicSigils } from "./sigilEffects";

export interface SpellInfo {
    name: string;
    description: string;
}

export const SPELL_TABLE: Record<ElementType, Record<number, SpellInfo>> = {
    fire: {
        1: { name: "Fireball", description: "A bolt of flame" },
        2: { name: "Fire Blast", description: "A focused blast of fire" },
        3: { name: "Inferno Wave", description: "A wave of searing flames" },
        4: { name: "Cataclysm", description: "A devastating firestorm" },
        5: { name: "Pyroclasm", description: "Ultimate fire destruction" },
    },
    water: {
        1: { name: "Water Bolt", description: "A jet of pressurized water" },
        2: { name: "Tidal Surge", description: "A crushing wave of water" },
        3: { name: "Maelstrom", description: "A swirling vortex of water" },
        4: { name: "Tsunami", description: "An overwhelming tidal wave" },
        5: { name: "Abyssal Deluge", description: "The wrath of the deep" },
    },
    earth: {
        1: { name: "Rock Throw", description: "A hurled chunk of stone" },
        2: { name: "Boulder Slam", description: "A massive boulder crash" },
        3: { name: "Earthquake", description: "The ground tears apart" },
        4: { name: "Tectonic Crush", description: "Tectonic plates collide" },
        5: { name: "World Breaker", description: "The earth itself shatters" },
    },
    air: {
        1: { name: "Gust", description: "A sharp blast of wind" },
        2: { name: "Wind Slash", description: "Blades of cutting air" },
        3: { name: "Cyclone", description: "A howling tornado" },
        4: { name: "Tempest", description: "A raging superstorm" },
        5: { name: "Cataclysmic Gale", description: "Winds that rend reality" },
    },
    ice: {
        1: { name: "Ice Shard", description: "A razor-sharp ice spike" },
        2: { name: "Frost Blast", description: "A freezing burst of ice" },
        3: { name: "Blizzard", description: "An engulfing snowstorm" },
        4: { name: "Glacial Tomb", description: "Encased in eternal ice" },
        5: { name: "Absolute Zero", description: "All heat ceases to exist" },
    },
    lightning: {
        1: { name: "Spark", description: "A crackling jolt" },
        2: { name: "Lightning Bolt", description: "A searing bolt from above" },
        3: { name: "Thunder Storm", description: "The sky unleashes fury" },
        4: { name: "Chain Lightning", description: "Electricity arcs endlessly" },
        5: { name: "Divine Thunder", description: "Judgement from the heavens" },
    },
    arcane: {
        1: { name: "Arcane Missile", description: "A bolt of pure magic" },
        2: { name: "Arcane Barrage", description: "A volley of magic bolts" },
        3: { name: "Arcane Torrent", description: "A stream of raw energy" },
        4: { name: "Arcane Annihilation", description: "Magic tears reality apart" },
        5: { name: "Arcane Singularity", description: "A void of pure arcane power" },
    },
    death: {
        1: { name: "Death Touch", description: "A withering curse" },
        2: { name: "Soul Drain", description: "Drains the life force" },
        3: { name: "Necrotic Wave", description: "A wave of death energy" },
        4: { name: "Death Sentence", description: "Marks the target for death" },
        5: { name: "Reaper's Toll", description: "Death itself claims the soul" },
    },
    holy: {
        1: { name: "Smite", description: "A flash of divine light" },
        2: { name: "Holy Lance", description: "A spear of radiance" },
        3: { name: "Divine Wrath", description: "Holy fury rains down" },
        4: { name: "Judgement", description: "Celestial judgement is passed" },
        5: { name: "Armageddon", description: "The final divine reckoning" },
    },
    poison: {
        1: { name: "Toxic Spit", description: "A glob of venom" },
        2: { name: "Venom Strike", description: "Concentrated toxic blast" },
        3: { name: "Plague Cloud", description: "A choking miasma" },
        4: { name: "Pandemic", description: "A lethal contagion spreads" },
        5: { name: "Blight Extinction", description: "All life withers and dies" },
    },
    psy: {
        1: { name: "Mind Jab", description: "A psychic needle" },
        2: { name: "Psychic Blast", description: "A concussive mind wave" },
        3: { name: "Mind Crush", description: "Mental barriers shatter" },
        4: { name: "Psychic Storm", description: "A maelstrom of thought" },
        5: { name: "Ego Death", description: "The mind is utterly erased" },
    },
    shadow: {
        1: { name: "Shadow Bolt", description: "A shard of darkness" },
        2: { name: "Dark Pulse", description: "A wave of shadow energy" },
        3: { name: "Void Rift", description: "A tear in the fabric of light" },
        4: { name: "Shadow Eclipse", description: "Darkness consumes all light" },
        5: { name: "Oblivion", description: "Consumed by the void eternal" },
    },
    steel: {
        1: { name: "Iron Spike", description: "A sharp metallic projectile" },
        2: { name: "Steel Barrage", description: "A hail of metal shards" },
        3: { name: "Blade Storm", description: "A whirlwind of blades" },
        4: { name: "Iron Maiden", description: "Encased in crushing steel" },
        5: { name: "Meteor Strike", description: "An iron star crashes down" },
    },
};

// Combo spells for combinable elements (fire, water, earth, air, ice, lightning)
// Key format: "element1+element2" (alphabetically sorted)
//
// This is the "loose" combo table — it fires for any cast that contains
// exactly two distinct combinable elements regardless of count split, as
// long as the new poker-shape tables (TWO_PAIR_TABLE, FULL_HOUSE_TABLE)
// did not already match. So 1F+1L → Plasma Cannon, 1F+4L → Plasma Cannon,
// but 2F+2L → Dragonfire (two pair) and 3F+2L → Dragon's Breath (full house).
// Signature spell for the Haphazard sigil — a single unified name used at
// any tier when the resolver's all-unique branch fires. Gives players an
// instant visual tell in the Spell Preview ("Tier N Abomination" appears
// the moment a fully-unique hand is selected, regardless of which
// elements were played).
export const HAPHAZARD_SPELL: SpellInfo = {
    name: "Abomination",
    description: "A chaotic collision of elements collapsed into one strike.",
};

export const COMBO_TABLE: Record<string, SpellInfo> = {
    "air+fire": { name: "Smoke Signal", description: "Choking smoke and embers" },
    "air+water": { name: "Mist Veil", description: "A blinding fog descends" },
    "air+earth": { name: "Sandstorm", description: "Scouring winds and sand" },
    "air+ice": { name: "Hailstorm", description: "Razor ice carried by wind" },
    "air+lightning": { name: "Static Storm", description: "Electrified gale force" },
    "earth+fire": { name: "Magma Burst", description: "Molten rock erupts" },
    "earth+water": { name: "Mudslide", description: "A crushing wave of mud" },
    "earth+ice": { name: "Permafrost", description: "Frozen earth entombs" },
    "earth+lightning": { name: "Shatter Quake", description: "Electrified fissures crack" },
    "fire+ice": { name: "Thermal Shock", description: "Extreme heat meets extreme cold" },
    "fire+lightning": { name: "Plasma Cannon", description: "Superheated plasma blast" },
    "fire+water": { name: "Steam Burst", description: "Scalding steam explosion" },
    "ice+lightning": { name: "Frozen Thunder", description: "Lightning through ice shards" },
    "ice+water": { name: "Flash Freeze", description: "Instant glaciation" },
    "lightning+water": { name: "Electrocution", description: "Water conducts the charge" },
};

// ----- Synergy graph -----
//
// Each element has a tight set of "kin" elements it thematically fuses
// with — fire with earth/lightning/holy/air, water with ice/lightning/
// poison, etc. Only synergistic pairs produce poker-shape combos
// (Two Pair / Full House); pairs that aren't kin "cancel" and the
// resolver falls back to single-element behavior.
//
// This is the source of truth for both `TWO_PAIR_TABLE` and
// `FULL_HOUSE_TABLE` below — every key in those tables MUST come from
// a pair listed here. Listing the graph as data (rather than only as
// table entries) lets us validate at a glance and surface a "synergy
// chart" UI later without recomputing it.
//
// Total: 22 unordered pairs. Most elements have 3 synergies; 5 elements
// (earth, ice, lightning, shadow, water) have 4 because they're
// thematic "connectors" in the graph.
export const SYNERGY_PAIRS: ReadonlySet<string> = new Set([
    // Storm/elemental cluster
    "fire+lightning", "earth+fire", "fire+holy", "air+fire",
    "ice+water", "lightning+water", "poison+water",
    "earth+steel", "earth+ice", "earth+poison",
    "air+lightning", "air+ice", "air+water",
    "death+ice", "lightning+steel",
    // Arcane / mind / shadow cluster
    "arcane+psy", "arcane+shadow", "arcane+holy",
    "death+poison", "death+shadow",
    "holy+shadow", "psy+shadow", "psy+steel",
]);

/**
 * Sigil-granted synergy pairs. These element pairs are NOT in the base
 * `SYNERGY_PAIRS` set — they only become active when the player owns
 * the corresponding sigil. Keys are alphabetically sorted, same as
 * `SYNERGY_PAIRS`. Each sigil maps to the pair keys it unlocks.
 */
export const SIGIL_SYNERGY_PAIRS: Record<string, readonly string[]> = {
    burnrite: ["death+fire"],
};

/**
 * Helper: alphabetically-sorted key lookup for the synergy graph. Both
 * orders ("fire+lightning" and "lightning+fire") map to the same edge.
 * When `activeSigils` is provided, sigil-granted synergy pairs are also
 * checked.
 */
export function isSynergyPair(
    a: string,
    b: string,
    activeSigils?: readonly string[],
): boolean {
    const key = a < b ? `${a}+${b}` : `${b}+${a}`;
    if (SYNERGY_PAIRS.has(key)) return true;
    if (!activeSigils) return false;
    for (const sigilId of expandMimicSigils(activeSigils)) {
        if (SIGIL_SYNERGY_PAIRS[sigilId]?.includes(key)) return true;
    }
    return false;
}

// ----- Poker-shape combo tables -----
//
// These fire ONLY when the played runes form a poker shape AND the
// element pair is in `SYNERGY_PAIRS`. Non-synergistic poker shapes
// (e.g. 2 Fire + 2 Water) intentionally fall through to the single-
// element fallback so the canceling rule is respected — the resolver
// will NOT downgrade a non-synergy [2,2] hand into a loose duo combo,
// otherwise 2F+2W would still fire Steam Burst.

/**
 * Two Pair: shape signature `[2, 2]`. The elements are interchangeable
 * so the table key is alphabetically sorted (`a+b`, never `b+a`).
 * Tier is always 4 (all 4 played runes contribute).
 */
export const TWO_PAIR_TABLE: Record<string, SpellInfo> = {
    // Storm / elemental cluster
    "fire+lightning":   { name: "Dragonfire",      description: "Roaring flame charged with storm" },
    "earth+fire":       { name: "Magma Burst",     description: "Lava bursts from cracked stone" },
    "fire+holy":        { name: "Holy Fire",       description: "Sacred flame purifies all" },
    "air+fire":         { name: "Wildfire",        description: "Wind-fed flames sweep the field" },
    "ice+water":        { name: "Glacial Tide",    description: "An unstoppable wall of slush" },
    "lightning+water":  { name: "Electrocution",   description: "Conducted current lashes the foe" },
    "poison+water":     { name: "Toxic Tide",      description: "A wave laced with venom" },
    "earth+steel":      { name: "Mountain Crush",  description: "Stone-girded steel falls like a peak" },
    "earth+ice":        { name: "Permafrost",      description: "Frozen earth entombs" },
    "earth+poison":     { name: "Tar Pit",         description: "Boiling tar swallows the foe" },
    "air+lightning":    { name: "Tempest",         description: "A roaring electric gale" },
    "air+ice":          { name: "Hailstorm",       description: "Razor ice carried by wind" },
    "air+water":        { name: "Tidal Mist",      description: "Sea-laden gale floods the lungs" },
    "death+fire":       { name: "Hellfire",         description: "Flames fed by the dying breath" },
    "death+ice":        { name: "Frostbite",       description: "Killing cold gnaws bone" },
    "lightning+steel":  { name: "Railgun",         description: "Magnetized steel at lethal speed" },
    // Arcane / mind / shadow cluster
    "arcane+psy":       { name: "Mindrend",        description: "Raw thought tears the psyche" },
    "arcane+shadow":    { name: "Voidcraft",       description: "Spellcraft drawn from the void" },
    "arcane+holy":      { name: "Radiance",        description: "Pure light woven with magic" },
    "death+poison":     { name: "Pestilence",      description: "A creeping, killing rot" },
    "death+shadow":     { name: "Reaper's Embrace",description: "Cold death wrapped in shadow" },
    "holy+shadow":      { name: "Twilight",        description: "Dawn and dusk collide" },
    "psy+shadow":       { name: "Nightmare",       description: "Waking dread takes hold" },
    "psy+steel":        { name: "Resonance",       description: "Steel hums at the mind's frequency" },
};

/**
 * Full House: shape signature `[3, 2]`. Order MATTERS — `primary` is
 * the 3-of element (drives spell color/icon), `secondary` is the 2-of
 * element. Key format is `${primary}+${secondary}`. Tier is always 5
 * (all 5 played runes contribute).
 *
 * Each synergy pair has TWO directional Full House spells — the 3-of-A
 * version reads thematically different from the 3-of-B version.
 * 22 synergy pairs × 2 directions = 44 entries.
 */
export const FULL_HOUSE_TABLE: Record<string, SpellInfo> = {
    // fire + lightning
    "fire+lightning":   { name: "Inferno Storm",     description: "A firestorm crowned with thunder" },
    "lightning+fire":   { name: "Stormfire",         description: "A pillar of electrified flame" },
    // earth + fire
    "fire+earth":       { name: "Volcanic Eruption", description: "The earth splits and burns" },
    "earth+fire":       { name: "Lava Flow",         description: "A creeping river of molten rock" },
    // fire + holy
    "fire+holy":        { name: "Sacred Pyre",       description: "A bonfire blessed by the divine" },
    "holy+fire":        { name: "Wrath of the Sun",  description: "The sun's fury made manifest" },
    // air + fire
    "fire+air":         { name: "Firestorm",         description: "Wind drives a wall of flame" },
    "air+fire":         { name: "Cinder Gale",       description: "A scouring wind of embers" },
    // ice + water
    "water+ice":        { name: "Frozen Tsunami",    description: "A killing wave hardens midair" },
    "ice+water":        { name: "Iceberg",           description: "A monolith of ancient ice" },
    // lightning + water
    "water+lightning":  { name: "Charged Tide",      description: "A river bristling with current" },
    "lightning+water":  { name: "Storm Surge",       description: "Lightning rides a rising sea" },
    // poison + water
    "water+poison":     { name: "Plague Wave",       description: "A flood that brings the rot" },
    "poison+water":     { name: "Acid Rain",         description: "Burning droplets fall from above" },
    // earth + steel
    "earth+steel":      { name: "Bedrock Smash",     description: "Foundation stone-crushes the foe" },
    "steel+earth":      { name: "Iron Mountain",     description: "Reinforced steel falls like a peak" },
    // earth + ice
    "earth+ice":        { name: "Tundra Quake",      description: "Frozen earth shudders apart" },
    "ice+earth":        { name: "Glacial Wall",      description: "Stone-cored ice grinds forward" },
    // earth + poison
    "earth+poison":     { name: "Quagmire",          description: "A pit of churning, toxic mud" },
    "poison+earth":     { name: "Blighted Soil",     description: "Rot saturates the ground" },
    // air + lightning
    "air+lightning":    { name: "Hurricane",         description: "A spiraling, charged tempest" },
    "lightning+air":    { name: "Thunderstorm",      description: "Sky-tearing bolts ride the gale" },
    // air + ice
    "air+ice":          { name: "Blizzard",          description: "A whiteout of cutting ice" },
    "ice+air":          { name: "Ice Squall",        description: "A wall of frozen wind" },
    // air + water
    "air+water":        { name: "Sea Gale",          description: "A salt-soaked storm wind" },
    "water+air":        { name: "Maelstrom",         description: "A churning vortex of water and air" },
    // death + fire (sigil-gated: Burnrite)
    "fire+death":       { name: "Cremation",         description: "A pyre that consumes body and soul" },
    "death+fire":       { name: "Soul Pyre",         description: "Spirits burn in undying flame" },
    // death + ice
    "ice+death":        { name: "Eternal Winter",    description: "Ice that drinks the warmth of life" },
    "death+ice":        { name: "Soul Frost",        description: "Cold that freezes the spirit itself" },
    // lightning + steel
    "lightning+steel":  { name: "Lightning Lance",   description: "A spear of pure current" },
    "steel+lightning":  { name: "Magnetic Slam",     description: "Steel hurled by raw magnetism" },
    // arcane + psy
    "arcane+psy":       { name: "Arcane Insight",    description: "Magic-honed thought rends reality" },
    "psy+arcane":       { name: "Mind Spike",        description: "A psychic lance laced with spell" },
    // arcane + shadow
    "arcane+shadow":    { name: "Spell Eclipse",     description: "Magic eclipsed into raw void" },
    "shadow+arcane":    { name: "Void Surge",        description: "Darkness shaped by arcane will" },
    // arcane + holy
    "arcane+holy":      { name: "Astral Light",      description: "Star-bright magic burns the foe" },
    "holy+arcane":      { name: "Divine Cantrip",    description: "Sacred words made manifest" },
    // death + poison
    "death+poison":     { name: "Black Plague",      description: "A killing rot beyond cure" },
    "poison+death":     { name: "Necrotoxin",        description: "Venom that drains the soul" },
    // death + shadow
    "death+shadow":     { name: "Reaper's Toll",     description: "Death claims its due in darkness" },
    "shadow+death":     { name: "Soul Shroud",       description: "A pall that smothers life" },
    // holy + shadow
    "holy+shadow":      { name: "Dawn",              description: "First light burns the dark" },
    "shadow+holy":      { name: "Dusk",              description: "Encroaching night consumes the day" },
    // psy + shadow
    "psy+shadow":       { name: "Madness",           description: "Reason shattered by living dark" },
    "shadow+psy":       { name: "Dream Thief",       description: "Stolen thoughts twist into shadow" },
    // psy + steel
    "psy+steel":        { name: "Mind Lance",        description: "A psychic edge of pure thought" },
    "steel+psy":        { name: "Sonic Edge",        description: "Steel humming at killing pitch" },
};

// ----- Damage model: Base + Mult (Balatro-style) -----
//
// A cast resolves into a Base counter and a Mult counter, then the final
// damage applied to the enemy = baseTotal × mult.
//
//   baseTotal   = SPELL_TIER_BASE_DAMAGE[tier] + Σ runeBase × resistMod
//   mult        = SPELL_TIER_MULT[tier]
//   finalDamage = baseTotal × mult
//
// Where each contributing rune's base contribution is RUNE_BASE_DAMAGE
// keyed by its rarity, modified per-rune by enemy weakness (×1.5) or
// resistance (×0.5). The Spell Preview's two-chip damage section reads
// baseTotal and mult directly; the cast animation ticks the Base counter
// from spellBase up through each rune impact and the Mult chip stays
// static at the tier-derived value.

// Highest tier any cast can produce. The single-element resolver maxes
// at 5 same-element runes; combo resolvers (loose duo, full house,
// haphazard) cap rune-count→tier at the same ceiling. Index of the last
// entry in SPELL_TIER_BASE_DAMAGE / SPELL_TIER_MULT.
export const MAX_SPELL_TIER = 5;

// Clamp a raw rune-count (or count-derived value) into the valid tier
// range. Centralizes the per-resolver cap so SPELL_TIER_BASE_DAMAGE /
// SPELL_TIER_MULT array bounds and the cap stay in lockstep.
export function clampTier(n: number): number {
    return Math.min(n, MAX_SPELL_TIER);
}

// Per-tier flat base damage added to the Base counter on cast.
// Index = tier; tier 0 is unused/sentinel.
export const SPELL_TIER_BASE_DAMAGE = [0, 4, 8, 12, 16, 20] as const;

// Per-tier multiplier applied to the final base total.
// Index = tier; tier 0 is unused/sentinel.
export const SPELL_TIER_MULT = [0, 1, 2, 3, 4, 5] as const;

// Per-rune base damage by rarity. Each contributing rune adds this
// value (modified by per-rune resist/weak mod) to the Base counter.
// Rarer runes hit harder — tuned so a legendary contributes ~4× a
// common. Stacks cleanly with scrolls (which add SCROLL_RUNE_BONUS ×
// scrollLevel per matching-element rune), since both live on the Base
// track and sum additively inside calculateRuneDamageBreakdown.
export const RUNE_BASE_DAMAGE: Record<RarityType, number> = {
    common: 8,
    uncommon: 12,
    rare: 18,
    legendary: 30,
};
