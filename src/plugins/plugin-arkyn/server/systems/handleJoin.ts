import { ArkynPlayerState, EnemyState, type ArkynState } from "../../shared";
import { Logger } from "@core/shared/utils";
import { clearArraySchema } from "../utils/clearArraySchema";
import { initPlayerForRound } from "../utils/initPlayerForRound";
import { removePouch } from "../resources/playerPouch";
import { getEnemyForRound } from "../../shared/enemyDefinitions";
import type { ArkynContext } from "../types/ArkynContext";
import { initRunStats, removeRunStats } from "../resources/runStats";

const logger = new Logger("ArkynJoin");

export function handleJoin(
    state: ArkynState,
    client: { sessionId: string },
    ctx: ArkynContext,
): void {
    // Don't re-join if already in game — clean up the previous player + pouch
    // before creating fresh state, otherwise the stale pouch lingers in the
    // resource map between the delete and the next setPouch.
    if (state.players.has(client.sessionId)) {
        logger.info(`Player ${client.sessionId} already in game, re-initializing`);
        state.players.delete(client.sessionId);
        removePouch(client.sessionId);
        removeRunStats(client.sessionId);
    }

    // Create player state and run the standard round-init flow
    const player = new ArkynPlayerState();
    state.players.set(client.sessionId, player);
    initPlayerForRound(player, client.sessionId);

    // Initialize ephemeral run stats
    initRunStats(client.sessionId);

    // Load personal bests from save data (if available)
    const saveData = ctx.getSaveData(client.sessionId);
    if (saveData) {
        player.bestRound = saveData.lifetime.highestRound;
        player.bestSingleCast = saveData.lifetime.highestSingleCastDamage;
    }

    // Spawn enemy for round 1
    spawnEnemy(state);

    // Set game state
    state.currentRound = 1;
    state.gamePhase = "playing";

    logger.info(`Player ${client.sessionId} joined. Hand: ${player.hand.length}, Pouch: ${player.pouchSize}`);
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
    clearArraySchema(enemy.resistances);
    clearArraySchema(enemy.weaknesses);
    for (const r of def.resistances) enemy.resistances.push(r);
    for (const w of def.weaknesses) enemy.weaknesses.push(w);

    state.enemy = enemy;
}

export { spawnEnemy };
