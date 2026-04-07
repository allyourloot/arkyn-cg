import { PlayerHotbarState, type SimpleHotbarState } from "../../shared";

export function getOrCreatePlayerState(state: SimpleHotbarState, sessionId: string): PlayerHotbarState {
    const existing = state.players.get(sessionId);
    if (existing) return existing;

    const playerState = new PlayerHotbarState();
    state.players.set(sessionId, playerState);
    return playerState;
}
