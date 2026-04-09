/**
 * Round-indexed enemy stat definitions. Each entry is the enemy a player
 * fights when `state.currentRound` lands on that index (1-based — round 1
 * is `ENEMY_DEFINITIONS[0]`).
 *
 * Damage model recap (`shared/calculateDamage.ts`):
 *     damage = 8 × tier × elementalMod
 *     elementalMod = 0.5 (resist) / 1.0 (neutral) / 1.5 (weak)
 *
 * The early rounds are tuned so that any cast tier 2+ should comfortably
 * kill the enemy in 1–2 casts even without rolling the weakness — they're
 * meant to feel like a warm-up. The curve then ramps up hard so later
 * rounds reward stacking weakness elements and using max-tier spells.
 */
export interface EnemyDefinition {
    name: string;
    hp: number;
    element: string;
    resistances: string[];
    weaknesses: string[];
}

export const ENEMY_DEFINITIONS: EnemyDefinition[] = [
    // ----- Trivial warm-up: one cast should usually do it. -----
    {
        name: "Goblin Scout",
        hp: 30,
        element: "earth",
        resistances: ["earth"],
        weaknesses: ["fire", "lightning"],
    },
    {
        name: "Forest Imp",
        hp: 45,
        element: "shadow",
        resistances: ["shadow"],
        weaknesses: ["holy", "fire"],
    },
    {
        name: "Stone Golem",
        hp: 70,
        element: "earth",
        resistances: ["earth", "steel"],
        weaknesses: ["water", "lightning"],
    },
    // ----- Real fights begin: two casts on average. -----
    {
        name: "Shadow Wraith",
        hp: 100,
        element: "shadow",
        resistances: ["shadow", "death"],
        weaknesses: ["holy", "fire"],
    },
    {
        name: "Fire Drake",
        hp: 140,
        element: "fire",
        resistances: ["fire"],
        weaknesses: ["water", "ice"],
    },
    {
        name: "Ice Elemental",
        hp: 180,
        element: "ice",
        resistances: ["ice", "water"],
        weaknesses: ["fire", "lightning"],
    },
    {
        name: "Dark Sorcerer",
        hp: 230,
        element: "arcane",
        resistances: ["arcane", "shadow"],
        weaknesses: ["holy", "psy"],
    },
    {
        name: "Ancient Wyrm",
        hp: 300,
        element: "death",
        resistances: ["death", "fire", "ice"],
        weaknesses: ["holy", "lightning"],
    },
];

/**
 * Look up the enemy definition for a given round number. Past the end of
 * the table, the last enemy's HP is scaled by ~25% per additional round so
 * the game keeps escalating instead of looping back to round-1 difficulty.
 */
export function getEnemyForRound(round: number): EnemyDefinition {
    const r = Math.max(1, round);
    if (r <= ENEMY_DEFINITIONS.length) {
        return ENEMY_DEFINITIONS[r - 1];
    }
    const last = ENEMY_DEFINITIONS[ENEMY_DEFINITIONS.length - 1];
    const extraRounds = r - ENEMY_DEFINITIONS.length;
    return {
        ...last,
        name: `${last.name} +${extraRounds}`,
        hp: Math.round(last.hp * Math.pow(1.25, extraRounds)),
    };
}
