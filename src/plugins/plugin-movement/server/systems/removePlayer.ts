import type { MovementState } from "../../shared";

export function removePlayer(state: MovementState, client: { sessionId: string }) {
    state.players.delete(client.sessionId);
}
