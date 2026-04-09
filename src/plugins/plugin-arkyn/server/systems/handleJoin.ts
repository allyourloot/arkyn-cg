import { ArkynPlayerState, EnemyState, HAND_SIZE, type ArkynState } from "../../shared";
import { Logger } from "@core/shared/utils";
import { createPouch } from "../utils/createPouch";
import { drawRunes, syncPlayerPouch } from "../utils/drawRunes";
import { setPouch } from "../resources/playerPouch";
import { getEnemyForRound } from "../utils/enemyDefinitions";

const logger = new Logger("ArkynJoin");

export function handleJoin(
    state: ArkynState,
    client: { sessionId: string },
): void {
    // Don't re-join if already in game
    if (state.players.has(client.sessionId)) {
        logger.info(`Player ${client.sessionId} already in game, re-initializing`);
        state.players.delete(client.sessionId);
    }

    // Create player state
    const player = new ArkynPlayerState();
    player.castsRemaining = 3;
    player.discardsRemaining = 3;
    state.players.set(client.sessionId, player);

    // Create and store pouch
    const pouch = createPouch();
    setPouch(client.sessionId, pouch);

    // Draw initial hand
    const drawn = drawRunes(pouch, HAND_SIZE);
    for (const rune of drawn) {
        player.hand.push(rune);
    }
    player.pouchSize = pouch.length;
    syncPlayerPouch(player, pouch);

    // Spawn enemy for round 1
    spawnEnemy(state);

    // Set game state
    state.currentRound = 1;
    state.gamePhase = "playing";

    logger.info(`Player ${client.sessionId} joined. Hand: ${player.hand.length}, Pouch: ${pouch.length}`);
}

function spawnEnemy(state: ArkynState): void {
    const round = Math.max(state.currentRound, 1);
    const def = getEnemyForRound(round);

    const enemy = new EnemyState();
    enemy.name = def.name;
    enemy.maxHp = def.hp;
    enemy.currentHp = def.hp;
    enemy.element = def.element;

    // Clear and set resistances/weaknesses
    while (enemy.resistances.length > 0) enemy.resistances.pop();
    while (enemy.weaknesses.length > 0) enemy.weaknesses.pop();
    for (const r of def.resistances) enemy.resistances.push(r);
    for (const w of def.weaknesses) enemy.weaknesses.push(w);

    state.enemy = enemy;
}

export { spawnEnemy };
