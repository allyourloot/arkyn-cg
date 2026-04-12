/**
 * Boss debuff definitions. Every 5th round is a boss round — the enemy
 * gains a single randomly-chosen debuff that hampers the player for that
 * fight. Debuffs are re-rolled each run so no two runs feel identical.
 */

export interface BossDebuff {
    id: string;
    name: string;
    description: string;
}

export const BOSS_DEBUFFS: readonly BossDebuff[] = [
    {
        id: "reduced_hand",
        name: "Reduced Hand",
        description: "-1 Hand Size",
    },
    {
        id: "fortified",
        name: "Fortified",
        description: "+50% HP",
    },
    {
        id: "exhausting",
        name: "Exhausting",
        description: "-1 Cast",
    },
    {
        id: "unyielding",
        name: "Unyielding",
        description: "-1 Discard",
    },
];

/** Boss rounds occur every 5th round (5, 10, 15, …). */
export function isBossRound(round: number): boolean {
    return round > 0 && round % 5 === 0;
}

/** Pick a random debuff from the pool. */
export function pickRandomDebuff(): BossDebuff {
    return BOSS_DEBUFFS[Math.floor(Math.random() * BOSS_DEBUFFS.length)];
}

/** Look up display info for a debuff ID. Returns undefined for non-boss enemies. */
export function getDebuffById(debuffId: string): BossDebuff | undefined {
    return BOSS_DEBUFFS.find(d => d.id === debuffId);
}
