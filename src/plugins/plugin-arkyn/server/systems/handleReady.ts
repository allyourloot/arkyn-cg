import { HAND_SIZE, type ArkynState } from "../../shared";
import { Logger } from "@core/shared/utils";
import { createPouch } from "../utils/createPouch";
import { drawRunes, syncPlayerPouch } from "../utils/drawRunes";
import { setPouch } from "../resources/playerPouch";
import { spawnEnemy } from "./handleJoin";

const logger = new Logger("ArkynReady");

export function handleReady(
    state: ArkynState,
    client: { sessionId: string },
): void {
    if (state.gamePhase !== "round_end") {
        logger.warn(`Ready rejected: game phase is ${state.gamePhase}`);
        return;
    }

    const player = state.players.get(client.sessionId);
    if (!player) {
        logger.warn(`Ready rejected: player ${client.sessionId} not found`);
        return;
    }

    // Next round
    state.currentRound++;

    // Reset player state
    while (player.hand.length > 0) player.hand.pop();
    while (player.playedRunes.length > 0) player.playedRunes.pop();
    player.lastSpellName = "";
    player.lastSpellTier = 0;
    player.lastDamage = 0;
    player.castsRemaining = 3;
    player.discardsRemaining = 3;

    // Create fresh pouch for the new round
    const pouch = createPouch();
    setPouch(client.sessionId, pouch);

    // Draw new hand
    const drawn = drawRunes(pouch, HAND_SIZE);
    for (const rune of drawn) {
        player.hand.push(rune);
    }
    player.pouchSize = pouch.length;
    syncPlayerPouch(player, pouch);

    // Spawn new enemy
    spawnEnemy(state);

    state.gamePhase = "playing";

    logger.info(`Round ${state.currentRound} started. Enemy: ${state.enemy.name} (HP: ${state.enemy.maxHp})`);
}
