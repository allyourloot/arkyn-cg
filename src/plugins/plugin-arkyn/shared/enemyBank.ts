/**
 * Enemy name bank — a large pool of enemies that the seeded RNG draws
 * from each round. HP is NOT stored here; it comes from the round's
 * position on the difficulty curve (see enemyDefinitions.ts).
 *
 * Each entry defines an identity: name, primary element, what it resists,
 * and what it's weak to. Resistances / weaknesses are designed to make
 * thematic sense for the creature.
 */

export interface EnemyTemplate {
    name: string;
    element: string;
    resistances: string[];
    weaknesses: string[];
}

export const ENEMY_BANK: readonly EnemyTemplate[] = [
    // ── Air ──
    { name: "Wind Sprite", element: "air", resistances: ["air"], weaknesses: ["ice", "earth"] },
    { name: "Storm Hawk", element: "air", resistances: ["air", "lightning"], weaknesses: ["ice", "steel"] },
    { name: "Gale Phantom", element: "air", resistances: ["air"], weaknesses: ["earth", "lightning"] },

    // ── Arcane ──
    { name: "Spell Weaver", element: "arcane", resistances: ["arcane"], weaknesses: ["holy", "psy"] },
    { name: "Rune Golem", element: "arcane", resistances: ["arcane", "steel"], weaknesses: ["psy", "lightning"] },
    { name: "Mystic Shade", element: "arcane", resistances: ["arcane", "shadow"], weaknesses: ["holy", "fire"] },

    // ── Death ──
    { name: "Bone Reaper", element: "death", resistances: ["death"], weaknesses: ["holy", "fire"] },
    { name: "Grave Knight", element: "death", resistances: ["death", "steel"], weaknesses: ["holy", "lightning"] },
    { name: "Soul Eater", element: "death", resistances: ["death", "shadow"], weaknesses: ["holy", "arcane"] },

    // ── Earth ──
    { name: "Stone Golem", element: "earth", resistances: ["earth", "steel"], weaknesses: ["water", "lightning"] },
    { name: "Moss Crawler", element: "earth", resistances: ["earth", "water"], weaknesses: ["fire", "ice"] },
    { name: "Dirt Wurm", element: "earth", resistances: ["earth"], weaknesses: ["water", "air"] },

    // ── Fire ──
    { name: "Fire Drake", element: "fire", resistances: ["fire"], weaknesses: ["water", "ice"] },
    { name: "Ember Fiend", element: "fire", resistances: ["fire", "earth"], weaknesses: ["water", "lightning"] },
    { name: "Flame Wraith", element: "fire", resistances: ["fire", "shadow"], weaknesses: ["water", "holy"] },

    // ── Holy ──
    { name: "Fallen Paladin", element: "holy", resistances: ["holy"], weaknesses: ["shadow", "death"] },
    { name: "Light Sentinel", element: "holy", resistances: ["holy", "steel"], weaknesses: ["shadow", "arcane"] },
    { name: "Radiant Specter", element: "holy", resistances: ["holy", "air"], weaknesses: ["death", "poison"] },

    // ── Ice ──
    { name: "Frost Giant", element: "ice", resistances: ["ice", "water"], weaknesses: ["fire", "lightning"] },
    { name: "Ice Wraith", element: "ice", resistances: ["ice"], weaknesses: ["fire", "steel"] },
    { name: "Glacial Beast", element: "ice", resistances: ["ice", "earth"], weaknesses: ["fire", "holy"] },

    // ── Lightning ──
    { name: "Storm Elemental", element: "lightning", resistances: ["lightning"], weaknesses: ["earth", "ice"] },
    { name: "Thunder Drake", element: "lightning", resistances: ["lightning", "air"], weaknesses: ["earth", "water"] },
    { name: "Spark Golem", element: "lightning", resistances: ["lightning", "steel"], weaknesses: ["earth", "shadow"] },

    // ── Poison ──
    { name: "Venom Spider", element: "poison", resistances: ["poison"], weaknesses: ["psy", "arcane"] },
    { name: "Toxic Slime", element: "poison", resistances: ["poison", "water"], weaknesses: ["fire", "ice"] },
    { name: "Plague Rat", element: "poison", resistances: ["poison", "earth"], weaknesses: ["holy", "fire"] },

    // ── Psy ──
    { name: "Mind Flayer", element: "psy", resistances: ["psy"], weaknesses: ["shadow", "steel"] },
    { name: "Psychic Shade", element: "psy", resistances: ["psy", "shadow"], weaknesses: ["holy", "lightning"] },
    { name: "Dream Stalker", element: "psy", resistances: ["psy", "arcane"], weaknesses: ["death", "fire"] },

    // ── Shadow ──
    { name: "Shadow Wraith", element: "shadow", resistances: ["shadow"], weaknesses: ["holy", "lightning"] },
    { name: "Dark Stalker", element: "shadow", resistances: ["shadow", "death"], weaknesses: ["holy", "fire"] },
    { name: "Night Terror", element: "shadow", resistances: ["shadow", "psy"], weaknesses: ["holy", "arcane"] },

    // ── Steel ──
    { name: "Iron Golem", element: "steel", resistances: ["steel", "earth"], weaknesses: ["fire", "lightning"] },
    { name: "Steel Sentinel", element: "steel", resistances: ["steel"], weaknesses: ["fire", "water"] },
    { name: "Metal Warden", element: "steel", resistances: ["steel", "ice"], weaknesses: ["lightning", "arcane"] },

    // ── Water ──
    { name: "Sea Serpent", element: "water", resistances: ["water", "ice"], weaknesses: ["lightning", "poison"] },
    { name: "Tidal Fiend", element: "water", resistances: ["water"], weaknesses: ["lightning", "earth"] },
    { name: "Deep One", element: "water", resistances: ["water", "shadow"], weaknesses: ["lightning", "holy"] },
];
