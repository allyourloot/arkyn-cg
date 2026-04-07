import { PlayerPositionState, type PlayerRendererState } from "../../shared";

export function updatePlayerPosition(
    state: PlayerRendererState,
    client: { sessionId: string },
    payload: unknown,
) {
    const data = payload as { x?: number; y?: number; z?: number; yaw?: number; pitch?: number } | null;
    if (!data || typeof data !== "object") return;

    const { x, y, z, yaw, pitch } = data;
    if (
        typeof x !== "number" || typeof y !== "number" || typeof z !== "number"
        || typeof yaw !== "number" || typeof pitch !== "number"
    ) {
        return;
    }

    let playerState = state.players.get(client.sessionId);
    if (!playerState) {
        playerState = new PlayerPositionState();
        state.players.set(client.sessionId, playerState);
    }

    playerState.x = x;
    playerState.y = y;
    playerState.z = z;
    playerState.yaw = yaw;
    playerState.pitch = pitch;
}
