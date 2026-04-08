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
