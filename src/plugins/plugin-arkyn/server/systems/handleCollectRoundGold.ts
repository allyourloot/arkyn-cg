import { type ArkynState } from "../../shared";
import { Logger } from "@core/shared/utils";
import { getRunStats } from "../resources/runStats";

const logger = new Logger("ArkynCollectRoundGold");

/**
 * ARKYN_COLLECT_ROUND_GOLD is fired by the client when the "Total" line
 * reveals on the RoundEnd overlay — not when the Continue button is
 * clicked. This decouples the gold credit moment from the phase
 * transition (which still happens on Continue via ARKYN_READY) so the
 * player sees their bank tick up as the total stinger lands, then
 * dismisses the overlay on their own time.
 *
 * `handleCast` stamps the breakdown fields (`lastRoundGoldBase`,
 * `lastRoundGoldHandsBonus`) on the killing blow but does NOT credit
 * `player.gold`. This handler does the credit.
 *
 * Idempotency: the client fires this exactly once per round_end episode
 * (the RoundEnd overlay's reveal useEffect only runs once per unique
 * breakdown). We deliberately do NOT zero the breakdown fields after
 * the award — doing so would change the overlay's subscribed values
 * mid-animation and restart the reveal sequence.
 */
export function handleCollectRoundGold(
    state: ArkynState,
    client: { sessionId: string },
): void {
    const player = state.players.get(client.sessionId);
    if (!player) {
        logger.warn(`CollectRoundGold rejected: player ${client.sessionId} not found`);
        return;
    }

    if (state.gamePhase !== "round_end") {
        // Not in round_end — nothing to collect. Silently no-op; a late
        // retry from the client (e.g. flaky network) shouldn't log at
        // warn severity.
        return;
    }

    // Idempotency guard — the flag is cleared in handleCast when the next
    // kill stages a fresh breakdown, so a re-mount of the RoundEnd overlay
    // re-firing this message won't double-credit.
    if (player.lastRoundGoldCollected) return;

    const roundGold =
        player.lastRoundGoldBase
        + player.lastRoundGoldHandsBonus
        + player.lastRoundGoldSigilBonus;
    if (roundGold <= 0) return;

    player.gold += roundGold;
    player.lastRoundGoldCollected = true;
    const stats = getRunStats(client.sessionId);
    if (stats) stats.goldEarned += roundGold;

    logger.info(
        `Player ${client.sessionId} collected round-win gold: ` +
        `${player.lastRoundGoldBase} base + ${player.lastRoundGoldHandsBonus} hands bonus ` +
        `+ ${player.lastRoundGoldSigilBonus} sigil bonus ` +
        `= ${roundGold} (total: ${player.gold})`,
    );
}
