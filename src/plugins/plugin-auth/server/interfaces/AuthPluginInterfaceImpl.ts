import type { AuthState } from "../../shared/AuthState";
import type { AuthPluginInterface, AuthPluginInterfaceUser } from "./AuthPluginInterface";

export class AuthPluginInterfaceImpl implements AuthPluginInterface {
    private readonly state: AuthState;

    constructor(state: AuthState) {
        this.state = state;
    }

    getUserBySessionId(sessionId: string): AuthPluginInterfaceUser | null {
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

    getAllUsers(): AuthPluginInterfaceUser[] {
        return Array.from(this.state.players.entries()).map(([sessionId, entry]) => ({
            sessionId,
            userId: entry.userId,
            username: entry.username,
        }));
    }
}
