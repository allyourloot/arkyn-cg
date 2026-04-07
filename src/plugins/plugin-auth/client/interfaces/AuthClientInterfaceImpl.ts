import type { AuthState } from "../../shared/AuthState";
import type { AuthClientInterface, AuthClientUser } from "./AuthClientInterface";

export class AuthClientInterfaceImpl implements AuthClientInterface {
    private readonly state: AuthState;

    constructor(state: AuthState) {
        this.state = state;
    }

    getUserBySessionId(sessionId: string): AuthClientUser | null {
        const entry = this.state.players.get(sessionId);
        if (!entry) {
            return null;
        }

        return {
            sessionId,
            userId: entry.userId,
            username: entry.username,
        };
    }

    getAllUsers(): AuthClientUser[] {
        return Array.from(this.state.players.entries()).map(([sessionId, entry]) => ({
            sessionId,
            userId: entry.userId,
            username: entry.username,
        }));
    }
}
