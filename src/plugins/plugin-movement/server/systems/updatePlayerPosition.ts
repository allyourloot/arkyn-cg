import { MovementPlayerState, type MovementState } from "../../shared";

type UpdatePositionPayload = {
    x?: number;
    y?: number;
    z?: number;
    yaw?: number;
    pitch?: number;
};

export function updatePlayerPosition(
    state: MovementState,
    client: { sessionId: string },
    payload: unknown,
) {
    const data = payload as UpdatePositionPayload | null;
    if (!data || typeof data !== "object") return;

    const { x, y, z, yaw, pitch } = data;
    if (
        typeof x !== "number"
        || typeof y !== "number"
        || typeof z !== "number"
        || typeof yaw !== "number"
        || typeof pitch !== "number"
    ) {
        return;
    }

    let playerState = state.players.get(client.sessionId);
    if (!playerState) {
        playerState = new MovementPlayerState();
        state.players.set(client.sessionId, playerState);
    }

    playerState.x = x;
    playerState.y = y;
    playerState.z = z;
    playerState.yaw = yaw;
    playerState.pitch = pitch;
}
