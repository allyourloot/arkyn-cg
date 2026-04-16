import type { ArraySchema, MapSchema } from "@colyseus/schema";
import {
    calculateSpellDamage as sharedCalculateSpellDamage,
    getContributingRuneIndices,
    getHandMultBonus,
    getIgnoredResistanceElements,
    getSpellXMult,
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
): CastDamageResult {
    const weaknesses = Array.from(enemy.weaknesses);
    const activeSigils = sigils ? Array.from(sigils) : undefined;
    // Strip resistances whose element is nullified by an owned resist-ignore
    // sigil (Impale-style). The per-rune resistance lookup inside the shared
    // formula checks `resistances.includes(element)`, so removing the entry
    // here gives that rune a neutral (×1.0) mod even though the enemy's raw
    // state still reports the resistance. The UI shows a red X on the chip.
    const rawResistances = Array.from(enemy.resistances);
    const ignoredResistances = activeSigils
        ? getIgnoredResistanceElements(activeSigils)
        : null;
    const resistances = ignoredResistances && ignoredResistances.size > 0
        ? rawResistances.filter(e => !ignoredResistances.has(e))
        : rawResistances;
    const contributingIndices = getContributingRuneIndices(
        selectedRunes.map(r => ({ element: r.element })),
        activeSigils,
    );
    const contributingRunes = contributingIndices.map(i => ({ element: selectedRunes[i].element }));
    const contributingRuneRarities = contributingIndices.map(
        i => selectedRunes[i].rarity as RarityType,
    );

    // Hand-based mult bonus from Synapse-style sigils (held runes add mult).
    // Iterates SIGIL_HAND_MULT generically — no sigil-specific branching.
    const handMultBonus = (activeSigils && hand && selectedIndices)
        ? getHandMultBonus(activeSigils, hand, selectedIndices).total
        : 0;

    // Spell-element xMult from Supercell-style sigils. Multiplicative —
    // applied after all additive bonuses: finalMult = (tierMult + bonuses) × xMult.
    const spellElements = spell.comboElements
        ? [...spell.comboElements]
        : [spell.element];
    const xMultTotal = activeSigils
        ? getSpellXMult(activeSigils, spellElements).total
        : 1;

    const breakdown = sharedCalculateSpellDamage(
        spell,
        contributingRunes,
        contributingRuneRarities,
        resistances,
        weaknesses,
        scrollLevels,
        handMultBonus,
        xMultTotal,
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
        for (const proc of iterateProcs(
            activeSigils,
            contributingRunes.map(r => r.element),
            runSeed,
            currentRound,
            castNumber,
            breakdown.isCritical,
        )) {
            if (proc.effect.type === "double_damage") {
                // Adds the rune's base contribution again, multiplied by the
                // cast's final mult — matches legacy Voltage behavior.
                totalDamage += breakdown.runeBaseContributions[proc.runeIdx] * breakdown.mult;
            } else if (proc.effect.type === "grant_gold") {
                procGold += proc.effect.amount;
            }
        }
    }

    return { finalDamage: totalDamage, procGold };
}
