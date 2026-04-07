import { ArkynPlayerState, EnemyState, HAND_SIZE, type ArkynState } from "../../shared";
import { Logger } from "@core/shared/utils";
import { createPouch } from "../utils/createPouch";
import { drawRunes } from "../utils/drawRunes";
import { setPouch } from "../resources/playerPouch";

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

    // Spawn enemy for round 1
    spawnEnemy(state);

    // Set game state
    state.currentRound = 1;
    state.gamePhase = "playing";

    logger.info(`Player ${client.sessionId} joined. Hand: ${player.hand.length}, Pouch: ${pouch.length}`);
}

function spawnEnemy(state: ArkynState): void {
    const enemy = new EnemyState();
    const round = Math.max(state.currentRound, 1);

    // Scale enemy HP with round
    const baseHp = 80 + (round - 1) * 20;
    enemy.name = getEnemyName(round);
    enemy.maxHp = baseHp;
    enemy.currentHp = baseHp;
    enemy.element = "earth";

    // Clear and set resistances/weaknesses
    while (enemy.resistances.length > 0) enemy.resistances.pop();
    while (enemy.weaknesses.length > 0) enemy.weaknesses.pop();
    enemy.resistances.push("earth");
    enemy.weaknesses.push("fire");
    enemy.weaknesses.push("lightning");

    state.enemy = enemy;
}

function getEnemyName(round: number): string {
    const enemies = [
        "Goblin Scout",
        "Forest Imp",
        "Stone Golem",
        "Shadow Wraith",
        "Fire Drake",
        "Ice Elemental",
        "Dark Sorcerer",
        "Ancient Wyrm",
    ];
    return enemies[(round - 1) % enemies.length];
}

export { spawnEnemy };
