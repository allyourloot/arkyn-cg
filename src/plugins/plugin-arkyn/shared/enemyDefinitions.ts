/**
 * Round-indexed enemy stat definitions. Each entry is the enemy a player
 * fights when `state.currentRound` lands on that index (1-based — round 1
 * is `ENEMY_DEFINITIONS[0]`).
 *
 * Damage model recap (`shared/calculateDamage.ts`):
 *     baseTotal   = SPELL_TIER_BASE_DAMAGE[tier] + Σ runeBase × elementalMod
 *     finalDamage = baseTotal × SPELL_TIER_MULT[tier]
 *     elementalMod = 0.5 (resist) / 1.0 (neutral) / 1.5 (weak)
 *
 * HP tuned for the Base + Mult curve. Reference damage outputs (common):
 *   T1 = 12 neutral / 16 weak     T2 = 48 / 64
 *   T3 = 108 / 144                T4 = 192 / 256
 *   T5 = 300 / 400
 * Player has 3 casts per round with 8 runes in hand.
 */
export interface EnemyDefinition {
    name: string;
    hp: number;
    element: string;
    resistances: string[];
    weaknesses: string[];
}

export const ENEMY_DEFINITIONS: EnemyDefinition[] = [
    // ----- Warm-up: one good cast should do it. -----
    {
        name: "Goblin Scout",
        hp: 60,
        element: "earth",
        resistances: ["earth"],
        weaknesses: ["fire", "lightning"],
    },
    {
        name: "Forest Imp",
        hp: 100,
        element: "shadow",
        resistances: ["shadow"],
        weaknesses: ["holy", "fire"],
    },
    // ----- Getting real: need 2 decent casts. -----
    {
        name: "Stone Golem",
        hp: 175,
        element: "earth",
        resistances: ["earth", "steel"],
        weaknesses: ["water", "lightning"],
    },
    {
        name: "Shadow Wraith",
        hp: 300,
        element: "shadow",
        resistances: ["shadow", "death"],
        weaknesses: ["holy", "fire"],
    },
    // ----- Hard fights: need strong hands + weakness exploitation. -----
    {
        name: "Fire Drake",
        hp: 450,
        element: "fire",
        resistances: ["fire"],
        weaknesses: ["water", "ice"],
    },
    {
        name: "Ice Elemental",
        hp: 625,
        element: "ice",
        resistances: ["ice", "water"],
        weaknesses: ["fire", "lightning"],
    },
    {
        name: "Dark Sorcerer",
        hp: 800,
        element: "arcane",
        resistances: ["arcane", "shadow"],
        weaknesses: ["holy", "psy"],
    },
    // ----- Boss: need to maximize every cast. -----
    {
        name: "Ancient Wyrm",
        hp: 1000,
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
