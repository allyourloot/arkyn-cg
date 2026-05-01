import { SIGIL_DISCARD_HOOKS, snapshotRune, type ArkynState } from "../../shared";
import { Logger } from "@core/shared/utils";
import { refillHand } from "../utils/refillHand";
import { createRuneInstance } from "../utils/drawRunes";
import { getActiveSigilsExpanded } from "../utils/sigils";
import { removeRunesFromHand, validateRuneSelection } from "./utils/runeSelection";
import { getRunStats } from "../resources/runStats";
import type { ArkynContext } from "../types/ArkynContext";
import { evaluateAchievements, syncLifetimeToSchema } from "../utils/evaluateAchievements";

const logger = new Logger("ArkynDiscard");

export function handleDiscard(
    state: ArkynState,
    client: { sessionId: string },
    payload: unknown,
    ctx: ArkynContext,
): void {
    const result = validateRuneSelection(state, client, payload, {
        logger,
        action: "Discard",
        budgetField: "discardsRemaining",
    });
    if (!result) return;
    const { player, indices } = result;

    // Snapshot the discarded runes BEFORE removing them from the hand so
    // discard-hook sigils (Banish) can inspect element/rarity/level. Indices
    // are used in their original hand-order so a future hook targeting a
    // specific rune position behaves predictably.
    const discardedRunes = indices.map(i => snapshotRune(player.hand[i]));

    // Increment BEFORE dispatching hooks so the first discard of the round
    // sees `discardNumber: 1`.
    player.discardsUsedThisRound++;

    // Dispatch discard hooks. Each sigil can return zero or more effects
    // the caller dispatches over — new effect kinds slot in as switch arms.
    // Banish is MIMIC_INCOMPATIBLE, so mimic copies never appear for it
    // today; the expansion call is for future-proofing any additional
    // discard-hook sigil that IS Mimic-compatible.
    for (const entry of getActiveSigilsExpanded(player)) {
        const hook = SIGIL_DISCARD_HOOKS[entry.sigilId];
        if (!hook?.onDiscard) continue;
        const effects = hook.onDiscard({
            discardNumber: player.discardsUsedThisRound,
            runeCount: discardedRunes.length,
            runes: discardedRunes,
            ahoyElement: player.ahoyDiscardElement,
        });
        if (!effects) continue;
        for (const effect of effects) {
            switch (effect.type) {
                case "banishRune": {
                    const rune = discardedRunes[effect.runeIndex];
                    if (!rune) break;
                    // IDs rotate on each pouch rebuild, so persist the
                    // banish by (element, rarity, level) — the id is just
                    // a record of which specific hand rune was sacrificed.
                    // Factory validates rarity so the invariant "every
                    // RuneInstance has a canonical rarity" still holds.
                    player.banishedRunes.push(createRuneInstance(rune));
                    logger.info(
                        `Player ${client.sessionId} banished ${rune.rarity} ${rune.element} ` +
                        `via "${entry.sigilId}". Total banished: ${player.banishedRunes.length}.`,
                    );
                    break;
                }
                case "grantGold":
                    player.gold += effect.amount;
                    break;
            }
        }
    }

    // Remove discarded runes from hand
    removeRunesFromHand(player, indices);

    // Draw replacements
    refillHand(player, client.sessionId);

    player.discardsRemaining--;

    // Track discard in run stats
    const stats = getRunStats(client.sessionId);
    if (stats) stats.totalDiscards++;

    // Bump lifetime discard counter so the achievement evaluator can
    // catch the threshold (Discard Master = 100). Counts discard ACTIONS,
    // not runes — matches the existing run-stats semantic. Mirrors the
    // incremental pattern in handleCast (finalizeRun does not re-add).
    const saveData = ctx.getSaveData(client.sessionId);
    if (saveData) {
        saveData.lifetime.totalDiscards++;
    }
    syncLifetimeToSchema(player, ctx, client.sessionId);

    evaluateAchievements(client.sessionId, player, ctx, "discard");

    logger.info(`Player ${client.sessionId} discarded ${indices.length} runes. Discards remaining: ${player.discardsRemaining}`);
}
