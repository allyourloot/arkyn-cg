import { MAX_CONSUMABLES, MAX_SIGILS, SIGIL_DEFINITIONS, SIGIL_LIFECYCLE_HOOKS, type ArkynState } from "../../shared";
import { Logger } from "@core/shared/utils";

const logger = new Logger("ArkynDebugGrantSigil");

/**
 * Dev-only handler — grants a sigil to the player without charging gold
 * or going through the shop. Fired by the `window.arkyn.grantSigil(id)`
 * console helper registered in `client/debugCommands.ts`. Validates:
 *   - player exists
 *   - sigil id matches a real SIGIL_DEFINITIONS entry
 *   - sigil isn't already owned (prevents duplicates, which would break
 *     registries like SIGIL_INVENTORY_MULT that sum per-owned-instance)
 *   - there's at least one slot free (MAX_SIGILS)
 *
 * No authentication gate today — this is a testing convenience. Remove
 * the onMessage registration from `server/index.ts` before shipping to
 * production if that matters.
 */
export function handleDebugGrantSigil(
    state: ArkynState,
    client: { sessionId: string },
    payload: unknown,
): void {
    const player = state.players.get(client.sessionId);
    if (!player) {
        logger.warn(`Debug-grant rejected: player ${client.sessionId} not found`);
        return;
    }

    const data = payload as { sigilId?: string };
    const sigilId = data?.sigilId;
    if (typeof sigilId !== "string" || !sigilId) {
        logger.warn(`Debug-grant rejected: missing sigilId`);
        return;
    }
    if (!SIGIL_DEFINITIONS[sigilId]) {
        logger.warn(`Debug-grant rejected: unknown sigil "${sigilId}"`);
        return;
    }
    if (player.sigils.includes(sigilId)) {
        logger.warn(`Debug-grant rejected: "${sigilId}" already owned`);
        return;
    }
    if (player.sigils.length >= MAX_SIGILS) {
        logger.warn(`Debug-grant rejected: sigil slots full (${MAX_SIGILS})`);
        return;
    }

    player.sigils.push(sigilId);

    // Fire the granted sigil's round-start lifecycle hook immediately so
    // round-scoped state (Ahoy's discard element, Binoculars' disabled
    // resistance, Thief's scroll) reflects the sigil on the CURRENT round
    // instead of waiting for the next round start. Mirrors the dispatch
    // logic in `initPlayerForRound` but scoped to the newly-granted sigil.
    const hooks = SIGIL_LIFECYCLE_HOOKS[sigilId];
    if (hooks?.onRoundStart) {
        const effects = hooks.onRoundStart(player.currentRound, player.runSeed, {
            enemyResistances: Array.from(player.enemy.resistances),
            enemyWeaknesses: Array.from(player.enemy.weaknesses),
            copyIndex: 0,
        });
        if (effects) {
            for (const effect of effects) {
                switch (effect.type) {
                    case "grantConsumable":
                        if (player.consumables.length < MAX_CONSUMABLES) {
                            player.consumables.push(effect.consumableId);
                        }
                        break;
                    case "grantGold":
                        player.gold += effect.amount;
                        break;
                    case "grantStat":
                        player[effect.stat] += effect.amount;
                        break;
                    case "disableResistance":
                        player.disabledResistance = effect.element;
                        break;
                    case "setAhoyElement":
                        player.ahoyDiscardElement = effect.element;
                        break;
                }
            }
        }
    }

    logger.info(
        `[DEBUG] Player ${client.sessionId} granted "${sigilId}". ` +
        `Sigils: ${Array.from(player.sigils).join(", ")}`,
    );
}
