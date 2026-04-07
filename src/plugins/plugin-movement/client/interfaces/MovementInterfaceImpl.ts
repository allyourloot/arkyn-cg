import type { MovementState } from "../../shared";
import type { MovementPlayerTransform, MovementInterface } from "./MovementInterface";

export class MovementStateInterfaceImpl implements MovementInterface {
    private readonly state: MovementState;

    constructor(state: MovementState) {
        this.state = state;
    }

    getPlayers(): Iterable<[string, MovementPlayerTransform]> {
        return this.state.players.entries();
    }

    getPlayer(sessionId: string): MovementPlayerTransform | null {
        return this.state.players.get(sessionId) ?? null;
    }
}