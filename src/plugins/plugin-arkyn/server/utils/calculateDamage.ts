import type { ArraySchema, MapSchema } from "@colyseus/schema";
import {
    calculateSpellDamage as sharedCalculateSpellDamage,
    getContributingRuneIndices,
    type ResolvedSpell,
    type RuneInstance,
    type EnemyState,
} from "../../shared";
import type { RarityType } from "../../shared/arkynConstants";
import { CASTS_PER_ROUND, VOLTAGE_PROC_CHANCE, VOLTAGE_RNG_OFFSET, SYNAPSE_MULT_PER_PSY } from "../../shared/arkynConstants";
import { createRoundRng } from "../../shared/seededRandom";

// Server-side wrapper that adapts EnemyState's ArraySchema fields into plain
// arrays, derives the contributing runes from the player's selection, and
// delegates to the shared damage formula. Scroll bonuses are applied per-rune
// inside the shared formula — each rune's element is looked up in the
// scrollLevels map to add flat base damage from purchased scrolls.
//
// When the player owns the "voltage" sigil, a deterministic proc check runs
// for each contributing Lightning rune. Proc'd runes add their base
// contribution a second time, then the full total is multiplied by the tier
// mult — matching the client's animation breakdown identically.
export function calculateDamage(
    spell: ResolvedSpell,
    selectedRunes: readonly RuneInstance[],
    enemy: EnemyState,
    scrollLevels?: MapSchema<number>,
    sigils?: ArraySchema<string>,
    runSeed?: number,
    currentRound?: number,
    castsRemaining?: number,
    heldPsyCount?: number,
): number {
    const resistances = Array.from(enemy.resistances);
    const weaknesses = Array.from(enemy.weaknesses);
    const activeSigils = sigils ? Array.from(sigils) : undefined;
    const contributingIndices = getContributingRuneIndices(
        selectedRunes.map(r => ({ element: r.element })),
        activeSigils,
    );
    const contributingRunes = contributingIndices.map(i => ({ element: selectedRunes[i].element }));
    const contributingRuneRarities = contributingIndices.map(
        i => selectedRunes[i].rarity as RarityType,
    );

    // Synapse sigil — held Psy runes add flat mult bonus
    const synapseMult = (
        activeSigils?.includes("synapse") && heldPsyCount
    ) ? heldPsyCount * SYNAPSE_MULT_PER_PSY : 0;

    const breakdown = sharedCalculateSpellDamage(
        spell,
        contributingRunes,
        contributingRuneRarities,
        resistances,
        weaknesses,
        scrollLevels,
        synapseMult,
    );

    let totalDamage = breakdown.finalDamage;

    // Voltage proc — deterministic RNG shared with the client
    if (
        sigils &&
        runSeed !== undefined &&
        currentRound !== undefined &&
        castsRemaining !== undefined &&
        Array.from(sigils).includes("voltage")
    ) {
        const castNumber = CASTS_PER_ROUND - castsRemaining;
        const procRng = createRoundRng(runSeed, VOLTAGE_RNG_OFFSET + currentRound * 10 + castNumber);
        for (let i = 0; i < contributingRunes.length; i++) {
            if (contributingRunes[i].element === "lightning") {
                if (procRng() < VOLTAGE_PROC_CHANCE) {
                    // Proc adds the rune's base contribution again, then mult
                    totalDamage += breakdown.runeBaseContributions[i] * breakdown.mult;
                }
            }
        }
    }

    return totalDamage;
}
