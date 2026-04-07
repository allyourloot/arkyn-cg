import type { PlayerRendererState } from "../../shared";

export function removePlayer(
    state: PlayerRendererState,
    client: { sessionId: string },
) {
    state.players.delete(client.sessionId);
}
