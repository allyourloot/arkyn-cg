import type { Logger } from "@core/shared/utils";
import type { ArkynPlayerState, ArkynState } from "../../../shared";

/** Game-phase strings the player schema actually uses. */
export type GamePhase =
    | "menu"
    | "playing"
    | "shop"
    | "round_end"
    | "game_over";

export interface RequirePlayerArgs {
    state: ArkynState;
    client: { sessionId: string };
    /**
     * Per-action prefix for log warnings — should match the handler's
     * existing reject-message style (e.g. "Buy", "Use-consumable", "Sell").
     * Reused as `${action} rejected: …` so consolidating handlers don't
     * change the on-disk log format.
     */
    action: string;
    logger: Logger;
    /**
     * Allowlist of game phases this action is valid in. Omit to skip the
     * phase check (matches handlers that only validate player existence,
     * e.g. handleSellSigil / handleReorderSigils, which intentionally
     * accept any phase).
     */
    allowedPhases?: readonly GamePhase[];
    /**
     * What to do when the session has no player record. `"warn"` (default)
     * matches Buy / Use-consumable / Sell / Reorder / Reroll — explicit
     * log so dev can spot a mismatched session. `"silent"` matches
     * picker-commit handlers (handleApplyTarot, handleCodexChoice,
     * handlePackChoice) which fire on player-driven UI events that can
     * race a mid-action disconnect; logging a warning every time would
     * be noise.
     */
    onMissingPlayer?: "warn" | "silent";
}

/**
 * Shared player-lookup + game-phase guard for every server message handler.
 * Returns the resolved `ArkynPlayerState` on success, or `null` after
 * logging the appropriate warning. Callers early-return on null so the
 * handler body only runs against a validated player + phase.
 *
 * Centralizes the two-line preamble that used to open every handler — same
 * log messages, same null-return semantics. The richer rune-selection
 * validation (budget + selection legality) stays in `runeSelection.ts`;
 * this helper covers only the shared lookup-and-phase guard.
 */
export function requirePlayer(args: RequirePlayerArgs): ArkynPlayerState | null {
    const { state, client, action, logger, allowedPhases, onMissingPlayer = "warn" } = args;
    const player = state.players.get(client.sessionId);
    if (!player) {
        if (onMissingPlayer === "warn") {
            logger.warn(`${action} rejected: player ${client.sessionId} not found`);
        }
        return null;
    }
    if (allowedPhases && !allowedPhases.includes(player.gamePhase as GamePhase)) {
        logger.warn(`${action} rejected: game phase is ${player.gamePhase}`);
        return null;
    }
    return player;
}
