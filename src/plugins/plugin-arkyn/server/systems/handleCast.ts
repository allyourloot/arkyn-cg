import { HAND_SIZE, MAX_PLAY, type ArkynState } from "../../shared";
import { resolveSpell } from "../../shared/resolveSpell";
import { Logger } from "@core/shared/utils";
import { calculateDamage } from "../utils/calculateDamage";
import { drawRunes, syncPlayerPouch } from "../utils/drawRunes";
import { getPouch } from "../resources/playerPouch";

const logger = new Logger("ArkynCast");

export function handleCast(
    state: ArkynState,
    client: { sessionId: string },
    payload: unknown,
): void {
    if (state.gamePhase !== "playing") {
        logger.warn(`Cast rejected: game phase is ${state.gamePhase}`);
        return;
    }

    const player = state.players.get(client.sessionId);
    if (!player) {
        logger.warn(`Cast rejected: player ${client.sessionId} not found`);
        return;
    }

    if (player.castsRemaining <= 0) {
        logger.warn(`Cast rejected: no casts remaining`);
        return;
    }

    // Validate payload
    const data = payload as { selectedIndices?: number[] };
    const indices = data?.selectedIndices;
    if (!Array.isArray(indices) || indices.length === 0 || indices.length > MAX_PLAY) {
        logger.warn(`Cast rejected: invalid indices`);
        return;
    }

    // Validate all indices are within hand bounds
    const handSize = player.hand.length;
    for (const idx of indices) {
        if (!Number.isInteger(idx) || idx < 0 || idx >= handSize) {
            logger.warn(`Cast rejected: index ${idx} out of bounds (hand size ${handSize})`);
            return;
        }
    }

    // Check for duplicate indices
    if (new Set(indices).size !== indices.length) {
        logger.warn(`Cast rejected: duplicate indices`);
        return;
    }

    // Extract selected runes (by index)
    const selectedRunes = indices.map(i => player.hand[i]);

    // Resolve spell
    const spell = resolveSpell(selectedRunes.map(r => ({ element: r.element })));
    if (!spell) {
        logger.warn(`Cast rejected: could not resolve spell`);
        return;
    }

    // Calculate damage
    const damage = calculateDamage(spell, state.enemy);

    // Move selected runes to played area
    while (player.playedRunes.length > 0) player.playedRunes.pop();
    for (const rune of selectedRunes) {
        player.playedRunes.push(rune);
    }

    // Remove played runes from hand (remove in reverse order to preserve indices)
    const sortedIndices = [...indices].sort((a, b) => b - a);
    for (const idx of sortedIndices) {
        player.hand.splice(idx, 1);
    }

    // Apply damage
    state.enemy.currentHp = Math.max(0, state.enemy.currentHp - damage);

    // Update player state
    player.lastSpellName = spell.spellName;
    player.lastSpellTier = spell.tier;
    player.lastDamage = damage;
    player.castsRemaining--;

    logger.info(`${spell.spellName} (Tier ${spell.tier}) deals ${damage} damage! Enemy HP: ${state.enemy.currentHp}/${state.enemy.maxHp}`);

    // Check if enemy is defeated
    if (state.enemy.currentHp <= 0) {
        state.gamePhase = "round_end";
        logger.info(`Enemy defeated! Round ${state.currentRound} complete.`);
        return;
    }

    // Draw back to hand size
    const pouch = getPouch(client.sessionId);
    if (pouch && player.hand.length < HAND_SIZE) {
        const toDraw = HAND_SIZE - player.hand.length;
        const drawn = drawRunes(pouch, toDraw);
        for (const rune of drawn) {
            player.hand.push(rune);
        }
        player.pouchSize = pouch.length;
        syncPlayerPouch(player, pouch);
    }
}
