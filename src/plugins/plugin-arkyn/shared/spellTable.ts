import type { ElementType } from "./arkynConstants";

export interface SpellInfo {
    name: string;
    baseDamage: number;
    description: string;
}

export const SPELL_TABLE: Record<ElementType, Record<number, SpellInfo>> = {
    fire: {
        1: { name: "Fireball", baseDamage: 8, description: "A bolt of flame" },
        2: { name: "Fire Blast", baseDamage: 8, description: "A focused blast of fire" },
        3: { name: "Inferno Wave", baseDamage: 8, description: "A wave of searing flames" },
        4: { name: "Cataclysm", baseDamage: 8, description: "A devastating firestorm" },
        5: { name: "Pyroclasm", baseDamage: 8, description: "Ultimate fire destruction" },
    },
    water: {
        1: { name: "Water Bolt", baseDamage: 8, description: "A jet of pressurized water" },
        2: { name: "Tidal Surge", baseDamage: 8, description: "A crushing wave of water" },
        3: { name: "Maelstrom", baseDamage: 8, description: "A swirling vortex of water" },
        4: { name: "Tsunami", baseDamage: 8, description: "An overwhelming tidal wave" },
        5: { name: "Abyssal Deluge", baseDamage: 8, description: "The wrath of the deep" },
    },
    earth: {
        1: { name: "Rock Throw", baseDamage: 8, description: "A hurled chunk of stone" },
        2: { name: "Boulder Slam", baseDamage: 8, description: "A massive boulder crash" },
        3: { name: "Earthquake", baseDamage: 8, description: "The ground tears apart" },
        4: { name: "Tectonic Crush", baseDamage: 8, description: "Tectonic plates collide" },
        5: { name: "World Breaker", baseDamage: 8, description: "The earth itself shatters" },
    },
    air: {
        1: { name: "Gust", baseDamage: 8, description: "A sharp blast of wind" },
        2: { name: "Wind Slash", baseDamage: 8, description: "Blades of cutting air" },
        3: { name: "Cyclone", baseDamage: 8, description: "A howling tornado" },
        4: { name: "Tempest", baseDamage: 8, description: "A raging superstorm" },
        5: { name: "Cataclysmic Gale", baseDamage: 8, description: "Winds that rend reality" },
    },
    ice: {
        1: { name: "Ice Shard", baseDamage: 8, description: "A razor-sharp ice spike" },
        2: { name: "Frost Blast", baseDamage: 8, description: "A freezing burst of ice" },
        3: { name: "Blizzard", baseDamage: 8, description: "An engulfing snowstorm" },
        4: { name: "Glacial Tomb", baseDamage: 8, description: "Encased in eternal ice" },
        5: { name: "Absolute Zero", baseDamage: 8, description: "All heat ceases to exist" },
    },
    lightning: {
        1: { name: "Spark", baseDamage: 8, description: "A crackling jolt" },
        2: { name: "Lightning Bolt", baseDamage: 8, description: "A searing bolt from above" },
        3: { name: "Thunder Storm", baseDamage: 8, description: "The sky unleashes fury" },
        4: { name: "Chain Lightning", baseDamage: 8, description: "Electricity arcs endlessly" },
        5: { name: "Divine Thunder", baseDamage: 8, description: "Judgement from the heavens" },
    },
    arcane: {
        1: { name: "Arcane Missile", baseDamage: 8, description: "A bolt of pure magic" },
        2: { name: "Arcane Barrage", baseDamage: 8, description: "A volley of magic bolts" },
        3: { name: "Arcane Torrent", baseDamage: 8, description: "A stream of raw energy" },
        4: { name: "Arcane Annihilation", baseDamage: 8, description: "Magic tears reality apart" },
        5: { name: "Arcane Singularity", baseDamage: 8, description: "A void of pure arcane power" },
    },
    death: {
        1: { name: "Death Touch", baseDamage: 8, description: "A withering curse" },
        2: { name: "Soul Drain", baseDamage: 8, description: "Drains the life force" },
        3: { name: "Necrotic Wave", baseDamage: 8, description: "A wave of death energy" },
        4: { name: "Death Sentence", baseDamage: 8, description: "Marks the target for death" },
        5: { name: "Reaper's Toll", baseDamage: 8, description: "Death itself claims the soul" },
    },
    holy: {
        1: { name: "Smite", baseDamage: 8, description: "A flash of divine light" },
        2: { name: "Holy Lance", baseDamage: 8, description: "A spear of radiance" },
        3: { name: "Divine Wrath", baseDamage: 8, description: "Holy fury rains down" },
        4: { name: "Judgement", baseDamage: 8, description: "Celestial judgement is passed" },
        5: { name: "Armageddon", baseDamage: 8, description: "The final divine reckoning" },
    },
    poison: {
        1: { name: "Toxic Spit", baseDamage: 8, description: "A glob of venom" },
        2: { name: "Venom Strike", baseDamage: 8, description: "Concentrated toxic blast" },
        3: { name: "Plague Cloud", baseDamage: 8, description: "A choking miasma" },
        4: { name: "Pandemic", baseDamage: 8, description: "A lethal contagion spreads" },
        5: { name: "Blight Extinction", baseDamage: 8, description: "All life withers and dies" },
    },
    psy: {
        1: { name: "Mind Jab", baseDamage: 8, description: "A psychic needle" },
        2: { name: "Psychic Blast", baseDamage: 8, description: "A concussive mind wave" },
        3: { name: "Mind Crush", baseDamage: 8, description: "Mental barriers shatter" },
        4: { name: "Psychic Storm", baseDamage: 8, description: "A maelstrom of thought" },
        5: { name: "Ego Death", baseDamage: 8, description: "The mind is utterly erased" },
    },
    shadow: {
        1: { name: "Shadow Bolt", baseDamage: 8, description: "A shard of darkness" },
        2: { name: "Dark Pulse", baseDamage: 8, description: "A wave of shadow energy" },
        3: { name: "Void Rift", baseDamage: 8, description: "A tear in the fabric of light" },
        4: { name: "Shadow Eclipse", baseDamage: 8, description: "Darkness consumes all light" },
        5: { name: "Oblivion", baseDamage: 8, description: "Consumed by the void eternal" },
    },
    steel: {
        1: { name: "Iron Spike", baseDamage: 8, description: "A sharp metallic projectile" },
        2: { name: "Steel Barrage", baseDamage: 8, description: "A hail of metal shards" },
        3: { name: "Blade Storm", baseDamage: 8, description: "A whirlwind of blades" },
        4: { name: "Iron Maiden", baseDamage: 8, description: "Encased in crushing steel" },
        5: { name: "Meteor Strike", baseDamage: 8, description: "An iron star crashes down" },
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
export const COMBO_TABLE: Record<string, SpellInfo> = {
    "air+fire": { name: "Smoke Signal", baseDamage: 8, description: "Choking smoke and embers" },
    "air+water": { name: "Mist Veil", baseDamage: 8, description: "A blinding fog descends" },
    "air+earth": { name: "Sandstorm", baseDamage: 8, description: "Scouring winds and sand" },
    "air+ice": { name: "Hailstorm", baseDamage: 8, description: "Razor ice carried by wind" },
    "air+lightning": { name: "Static Storm", baseDamage: 8, description: "Electrified gale force" },
    "earth+fire": { name: "Magma Burst", baseDamage: 8, description: "Molten rock erupts" },
    "earth+water": { name: "Mudslide", baseDamage: 8, description: "A crushing wave of mud" },
    "earth+ice": { name: "Permafrost", baseDamage: 8, description: "Frozen earth entombs" },
    "earth+lightning": { name: "Shatter Quake", baseDamage: 8, description: "Electrified fissures crack" },
    "fire+ice": { name: "Thermal Shock", baseDamage: 8, description: "Extreme heat meets extreme cold" },
    "fire+lightning": { name: "Plasma Cannon", baseDamage: 8, description: "Superheated plasma blast" },
    "fire+water": { name: "Steam Burst", baseDamage: 8, description: "Scalding steam explosion" },
    "ice+lightning": { name: "Frozen Thunder", baseDamage: 8, description: "Lightning through ice shards" },
    "ice+water": { name: "Flash Freeze", baseDamage: 8, description: "Instant glaciation" },
    "lightning+water": { name: "Electrocution", baseDamage: 8, description: "Water conducts the charge" },
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
 * Helper: alphabetically-sorted key lookup for the synergy graph. Both
 * orders ("fire+lightning" and "lightning+fire") map to the same edge.
 */
export function isSynergyPair(a: string, b: string): boolean {
    const key = a < b ? `${a}+${b}` : `${b}+${a}`;
    return SYNERGY_PAIRS.has(key);
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
    "fire+lightning":   { name: "Dragonfire",      baseDamage: 8, description: "Roaring flame charged with storm" },
    "earth+fire":       { name: "Magma Burst",     baseDamage: 8, description: "Lava bursts from cracked stone" },
    "fire+holy":        { name: "Holy Fire",       baseDamage: 8, description: "Sacred flame purifies all" },
    "air+fire":         { name: "Wildfire",        baseDamage: 8, description: "Wind-fed flames sweep the field" },
    "ice+water":        { name: "Glacial Tide",    baseDamage: 8, description: "An unstoppable wall of slush" },
    "lightning+water":  { name: "Electrocution",   baseDamage: 8, description: "Conducted current lashes the foe" },
    "poison+water":     { name: "Toxic Tide",      baseDamage: 8, description: "A wave laced with venom" },
    "earth+steel":      { name: "Mountain Crush",  baseDamage: 8, description: "Stone-girded steel falls like a peak" },
    "earth+ice":        { name: "Permafrost",      baseDamage: 8, description: "Frozen earth entombs" },
    "earth+poison":     { name: "Tar Pit",         baseDamage: 8, description: "Boiling tar swallows the foe" },
    "air+lightning":    { name: "Tempest",         baseDamage: 8, description: "A roaring electric gale" },
    "air+ice":          { name: "Hailstorm",       baseDamage: 8, description: "Razor ice carried by wind" },
    "air+water":        { name: "Tidal Mist",      baseDamage: 8, description: "Sea-laden gale floods the lungs" },
    "death+ice":        { name: "Frostbite",       baseDamage: 8, description: "Killing cold gnaws bone" },
    "lightning+steel":  { name: "Railgun",         baseDamage: 8, description: "Magnetized steel at lethal speed" },
    // Arcane / mind / shadow cluster
    "arcane+psy":       { name: "Mindrend",        baseDamage: 8, description: "Raw thought tears the psyche" },
    "arcane+shadow":    { name: "Voidcraft",       baseDamage: 8, description: "Spellcraft drawn from the void" },
    "arcane+holy":      { name: "Radiance",        baseDamage: 8, description: "Pure light woven with magic" },
    "death+poison":     { name: "Pestilence",      baseDamage: 8, description: "A creeping, killing rot" },
    "death+shadow":     { name: "Reaper's Embrace",baseDamage: 8, description: "Cold death wrapped in shadow" },
    "holy+shadow":      { name: "Twilight",        baseDamage: 8, description: "Dawn and dusk collide" },
    "psy+shadow":       { name: "Nightmare",       baseDamage: 8, description: "Waking dread takes hold" },
    "psy+steel":        { name: "Resonance",       baseDamage: 8, description: "Steel hums at the mind's frequency" },
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
    "fire+lightning":   { name: "Inferno Storm",     baseDamage: 8, description: "A firestorm crowned with thunder" },
    "lightning+fire":   { name: "Stormfire",         baseDamage: 8, description: "A pillar of electrified flame" },
    // earth + fire
    "fire+earth":       { name: "Volcanic Eruption", baseDamage: 8, description: "The earth splits and burns" },
    "earth+fire":       { name: "Lava Flow",         baseDamage: 8, description: "A creeping river of molten rock" },
    // fire + holy
    "fire+holy":        { name: "Sacred Pyre",       baseDamage: 8, description: "A bonfire blessed by the divine" },
    "holy+fire":        { name: "Wrath of the Sun",  baseDamage: 8, description: "The sun's fury made manifest" },
    // air + fire
    "fire+air":         { name: "Firestorm",         baseDamage: 8, description: "Wind drives a wall of flame" },
    "air+fire":         { name: "Cinder Gale",       baseDamage: 8, description: "A scouring wind of embers" },
    // ice + water
    "water+ice":        { name: "Frozen Tsunami",    baseDamage: 8, description: "A killing wave hardens midair" },
    "ice+water":        { name: "Iceberg",           baseDamage: 8, description: "A monolith of ancient ice" },
    // lightning + water
    "water+lightning":  { name: "Charged Tide",      baseDamage: 8, description: "A river bristling with current" },
    "lightning+water":  { name: "Storm Surge",       baseDamage: 8, description: "Lightning rides a rising sea" },
    // poison + water
    "water+poison":     { name: "Plague Wave",       baseDamage: 8, description: "A flood that brings the rot" },
    "poison+water":     { name: "Acid Rain",         baseDamage: 8, description: "Burning droplets fall from above" },
    // earth + steel
    "earth+steel":      { name: "Bedrock Smash",     baseDamage: 8, description: "Foundation stone-crushes the foe" },
    "steel+earth":      { name: "Iron Mountain",     baseDamage: 8, description: "Reinforced steel falls like a peak" },
    // earth + ice
    "earth+ice":        { name: "Tundra Quake",      baseDamage: 8, description: "Frozen earth shudders apart" },
    "ice+earth":        { name: "Glacial Wall",      baseDamage: 8, description: "Stone-cored ice grinds forward" },
    // earth + poison
    "earth+poison":     { name: "Quagmire",          baseDamage: 8, description: "A pit of churning, toxic mud" },
    "poison+earth":     { name: "Blighted Soil",     baseDamage: 8, description: "Rot saturates the ground" },
    // air + lightning
    "air+lightning":    { name: "Hurricane",         baseDamage: 8, description: "A spiraling, charged tempest" },
    "lightning+air":    { name: "Thunderstorm",      baseDamage: 8, description: "Sky-tearing bolts ride the gale" },
    // air + ice
    "air+ice":          { name: "Blizzard",          baseDamage: 8, description: "A whiteout of cutting ice" },
    "ice+air":          { name: "Ice Squall",        baseDamage: 8, description: "A wall of frozen wind" },
    // air + water
    "air+water":        { name: "Sea Gale",          baseDamage: 8, description: "A salt-soaked storm wind" },
    "water+air":        { name: "Maelstrom",         baseDamage: 8, description: "A churning vortex of water and air" },
    // death + ice
    "ice+death":        { name: "Eternal Winter",    baseDamage: 8, description: "Ice that drinks the warmth of life" },
    "death+ice":        { name: "Soul Frost",        baseDamage: 8, description: "Cold that freezes the spirit itself" },
    // lightning + steel
    "lightning+steel":  { name: "Lightning Lance",   baseDamage: 8, description: "A spear of pure current" },
    "steel+lightning":  { name: "Magnetic Slam",     baseDamage: 8, description: "Steel hurled by raw magnetism" },
    // arcane + psy
    "arcane+psy":       { name: "Arcane Insight",    baseDamage: 8, description: "Magic-honed thought rends reality" },
    "psy+arcane":       { name: "Mind Spike",        baseDamage: 8, description: "A psychic lance laced with spell" },
    // arcane + shadow
    "arcane+shadow":    { name: "Spell Eclipse",     baseDamage: 8, description: "Magic eclipsed into raw void" },
    "shadow+arcane":    { name: "Void Surge",        baseDamage: 8, description: "Darkness shaped by arcane will" },
    // arcane + holy
    "arcane+holy":      { name: "Astral Light",      baseDamage: 8, description: "Star-bright magic burns the foe" },
    "holy+arcane":      { name: "Divine Cantrip",    baseDamage: 8, description: "Sacred words made manifest" },
    // death + poison
    "death+poison":     { name: "Black Plague",      baseDamage: 8, description: "A killing rot beyond cure" },
    "poison+death":     { name: "Necrotoxin",        baseDamage: 8, description: "Venom that drains the soul" },
    // death + shadow
    "death+shadow":     { name: "Reaper's Toll",     baseDamage: 8, description: "Death claims its due in darkness" },
    "shadow+death":     { name: "Soul Shroud",       baseDamage: 8, description: "A pall that smothers life" },
    // holy + shadow
    "holy+shadow":      { name: "Dawn",              baseDamage: 8, description: "First light burns the dark" },
    "shadow+holy":      { name: "Dusk",              baseDamage: 8, description: "Encroaching night consumes the day" },
    // psy + shadow
    "psy+shadow":       { name: "Madness",           baseDamage: 8, description: "Reason shattered by living dark" },
    "shadow+psy":       { name: "Dream Thief",       baseDamage: 8, description: "Stolen thoughts twist into shadow" },
    // psy + steel
    "psy+steel":        { name: "Mind Lance",        baseDamage: 8, description: "A psychic edge of pure thought" },
    "steel+psy":        { name: "Sonic Edge",        baseDamage: 8, description: "Steel humming at killing pitch" },
};

// Tier multipliers (index = tier).
//
// Damage model: every rune contributes 8 base damage. The tier of a spell
// equals the number of runes powering it (1..5), so the tier multiplier
// scales linearly with rune count. The final formula is therefore:
//
//     totalDamage = 8 (per-rune base) × tier × elementalMod
//
// Future upgrades / items will modify per-rune base or tier multiplier
// independently — the linear baseline keeps that math easy to reason about.
export const TIER_MULTIPLIERS = [0, 1, 2, 3, 4, 5];
