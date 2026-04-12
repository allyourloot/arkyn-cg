import { ArkynPlayerState, EnemyState, type ArkynState } from "../../shared";
import { Logger } from "@core/shared/utils";
import { clearArraySchema } from "../utils/clearArraySchema";
import { initPlayerForRound } from "../utils/initPlayerForRound";
import { removePouch } from "../resources/playerPouch";
import { getEnemyForRound } from "../../shared/enemyDefinitions";
import { isBossRound, pickDebuffForRound } from "../../shared/bossDebuffs";
import { generateRunSeed } from "../../shared/seededRandom";
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

    // Generate a fresh run seed and spawn enemy for round 1
    state.runSeed = generateRunSeed();
    state.currentRound = 1;
    spawnEnemy(state);
    applyBossDebuff(state, player);

    // Set game state
    state.gamePhase = "playing";

    logger.info(`Player ${client.sessionId} joined. Seed: ${state.runSeed}. Hand: ${player.hand.length}, Pouch: ${player.pouchSize}`);
}

function spawnEnemy(state: ArkynState, roundOverride?: number): void {
    const round = roundOverride ?? Math.max(state.currentRound, 1);
    const def = getEnemyForRound(round, state.runSeed);

    const enemy = new EnemyState();
    enemy.name = def.name;
    enemy.element = def.element;

    // Clear and set resistances/weaknesses
    clearArraySchema(enemy.resistances);
    clearArraySchema(enemy.weaknesses);
    for (const r of def.resistances) enemy.resistances.push(r);
    for (const w of def.weaknesses) enemy.weaknesses.push(w);

    // Boss rounds: pick a seeded debuff. The "fortified" debuff boosts
    // HP here; other debuffs modify the player state in applyBossDebuff.
    let hp = def.hp;
    if (isBossRound(round)) {
        const debuff = pickDebuffForRound(round, state.runSeed);
        enemy.isBoss = true;
        enemy.debuff = debuff.id;
        if (debuff.id === "fortified") {
            hp = Math.round(hp * 1.5);
        }
    }

    enemy.maxHp = hp;
    enemy.currentHp = hp;
    state.enemy = enemy;
}

/**
 * Apply boss debuff effects that modify the player (not the enemy).
 * Called after both spawnEnemy and initPlayerForRound so the player's
 * fresh-round budgets are set before we subtract from them.
 */
function applyBossDebuff(state: ArkynState, player: ArkynPlayerState): void {
    const { debuff } = state.enemy;
    if (!debuff) return;

    switch (debuff) {
        case "reduced_hand":
            player.handSize--;
            // Remove the last rune drawn so the hand matches the new cap.
            if (player.hand.length > player.handSize) {
                player.hand.pop();
            }
            break;
        case "exhausting":
            player.castsRemaining = Math.max(1, player.castsRemaining - 1);
            break;
        case "unyielding":
            player.discardsRemaining = Math.max(0, player.discardsRemaining - 1);
            break;
        // "fortified" is handled in spawnEnemy (HP boost).
    }
}

export { spawnEnemy, applyBossDebuff };
