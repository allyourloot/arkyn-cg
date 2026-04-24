import type { ArraySchema, MapSchema } from "@colyseus/schema";
import {
    calculateSpellDamage as sharedCalculateSpellDamage,
    composeCastModifiers,
    flattenMapSchema,
    getContributingRuneIndices,
    iterateProcs,
    type ResolvedSpell,
    type RuneInstance,
    type EnemyState,
} from "../../shared";
import type { RarityType } from "../../shared/arkynConstants";
import { CASTS_PER_ROUND } from "../../shared/arkynConstants";

// Server-side wrapper that adapts EnemyState's ArraySchema fields into plain
// arrays, derives the contributing runes from the player's selection, and
// delegates to the shared damage formula. Scroll bonuses are applied per-rune
// inside the shared formula — each rune's element is looked up in the
// scrollLevels map to add flat base damage from purchased scrolls.
//
// Sigil effects are applied generically via the registries in `sigilEffects.ts`:
// - Hand-based mult bonuses (Synapse-style): via `getHandMultBonus()`
// - RNG procs on played runes (Voltage-style): via `iterateProcs()`
// Both use deterministic RNG that the client mirrors for animation accuracy.
//
// Returns both the final damage and any proc-granted gold (Fortune-style
// sigils) so the caller can credit the player's gold in the same tick.
export interface CastDamageResult {
    finalDamage: number;
    procGold: number;
}

export function calculateDamage(
    spell: ResolvedSpell,
    selectedRunes: readonly RuneInstance[],
    enemy: EnemyState,
    scrollLevels?: MapSchema<number>,
    sigils?: ArraySchema<string>,
    runSeed?: number,
    currentRound?: number,
    castsRemaining?: number,
    hand?: readonly RuneInstance[],
    selectedIndices?: readonly number[],
    disabledResistance?: string,
    sigilAccumulators?: MapSchema<number>,
): CastDamageResult & { criticalCount: number } {
    const weaknesses = Array.from(enemy.weaknesses);
    const activeSigils = sigils ? Array.from(sigils) : [];

    const contributingIndices = getContributingRuneIndices(
        selectedRunes.map(r => ({ element: r.element })),
        activeSigils,
    );
    const contributingRunes = contributingIndices.map(i => ({ element: selectedRunes[i].element }));
    const contributingRuneRarities = contributingIndices.map(
        i => selectedRunes[i].rarity as RarityType,
    );

    // Flatten the accumulator MapSchema once so the shared helper gets a
    // plain object — avoids forcing composeCastModifiers to know about
    // Colyseus Schema types.
    const accumulatorsPlain = sigilAccumulators
        ? flattenMapSchema(sigilAccumulators)
        : {};

    // Compose all sigil-driven cast modifiers through the shared helper.
    // The client runs the exact same helper so bonusMult / xMult / stripped
    // resistances are guaranteed byte-identical across server and client.
    const modifiers = composeCastModifiers({
        sigils: activeSigils,
        spellElements: spell.comboElements
            ? [...spell.comboElements]
            : [spell.element],
        spellTier: spell.tier,
        hand: hand ? hand.map(r => ({ element: r.element })) : [],
        selectedIndices: selectedIndices ?? [],
        contributingRunes,
        rawResistances: Array.from(enemy.resistances),
        weaknesses,
        disabledResistance,
        sigilAccumulators: accumulatorsPlain,
    });

    const breakdown = sharedCalculateSpellDamage(
        spell,
        contributingRunes,
        contributingRuneRarities,
        modifiers.effectiveResistances,
        weaknesses,
        scrollLevels,
        modifiers.bonusMult,
        modifiers.xMult,
        modifiers.perRuneBaseBonus,
    );

    let totalDamage = breakdown.finalDamage;
    let procGold = 0;

    // Apply proc effects from all owned proc-style sigils. `iterateProcs`
    // walks SIGIL_PROCS, rolls the deterministic RNG for each matching rune,
    // and yields proc events in a stable order (client mirrors this exactly).
    if (
        activeSigils &&
        runSeed !== undefined &&
        currentRound !== undefined &&
        castsRemaining !== undefined
    ) {
        const castNumber = CASTS_PER_ROUND - castsRemaining;
        // `castsRemaining` here is the PRE-cast value (handleCast decrements
        // after calling calculateDamage), so castsRemaining === 1 means this
        // cast consumes the final slot — Chainlink's retrigger trigger.
        const isFinalCast = castsRemaining === 1;
        for (const proc of iterateProcs(
            activeSigils,
            contributingRunes.map(r => r.element),
            runSeed,
            currentRound,
            castNumber,
            breakdown.isCritical,
            isFinalCast,
        )) {
            if (proc.effect.type === "double_damage") {
                // Adds the rune's base contribution again, multiplied by the
                // cast's final mult — matches legacy Voltage behavior.
                totalDamage += Math.round(breakdown.runeBaseContributions[proc.runeIdx] * breakdown.mult);
            } else if (proc.effect.type === "grant_gold") {
                procGold += proc.effect.amount;
            } else if (proc.effect.type === "execute") {
                // Execute GUARANTEES the kill but PRESERVES natural damage
                // — `Math.max` means a 300-damage Reaper's Toll on a 168-HP
                // enemy still records 300 toward the highest-damage stat
                // (the player's spell mattered), while a 50-damage cast on
                // the same enemy bumps up to 168 to ensure the kill lands.
                // The floating damage bubble shows "EXECUTED!" instead of
                // a number when this fires (see EnemyHealthBar.tsx) — the
                // numeric value is for stats, not for the on-screen reveal.
                totalDamage = Math.max(totalDamage, enemy.currentHp);
            }
        }
    }

    // Count critical hits for accumulator sigils (Executioner). Only
    // contributing runes participate — kickers and non-primary runes don't
    // count. `isCritical` is already per-contributing-rune.
    let criticalCount = 0;
    for (const c of breakdown.isCritical) if (c) criticalCount++;

    return { finalDamage: totalDamage, procGold, criticalCount };
}
