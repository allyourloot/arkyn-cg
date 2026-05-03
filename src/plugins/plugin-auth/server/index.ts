import { ServerPlugin, ServerRuntime } from "@core/server";
import { AuthState } from "../shared/AuthState";
import { Logger } from "@core/shared/utils";
import { AuthEntry } from "../shared/AuthState";
import { AuthPluginInterfaceImpl } from "./interfaces/AuthPluginInterfaceImpl";
import type { AuthPluginInterface } from "./interfaces/AuthPluginInterface";

const logger = new Logger("AuthPluginServer");

type UserAuthData = {
    userId: string;
    username: string;
};

const SESSION_VALIDATION_URL = "https://prod.creative.hytopia.com/Play/Matchmaking/Lobbies/ValidateSession";

type SessionValidationRequest = {
    lobbyId: string;
    sessionToken: string;
};

type SessionValidationResponse = {
    type?: string;
    user?: {
        id?: string;
        username?: string;
    };
};

function parseSessionValidationRequest(options: unknown): SessionValidationRequest {
    if (!options || typeof options !== "object") {
        throw new Error("Missing auth options");
    }

    const data = options as Record<string, unknown>;
    const lobbyId = data.lobbyId;
    const sessionToken = data.sessionToken;

    if (typeof lobbyId !== "string" || lobbyId.length === 0) {
        throw new Error("Missing or invalid lobbyId");
    }

    if (typeof sessionToken !== "string" || sessionToken.length === 0) {
        throw new Error("Missing or invalid sessionToken");
    }

    return {
        lobbyId,
        sessionToken,
    };
}

async function validateSessionInProduction(options: unknown): Promise<UserAuthData | null> {
    if (process.env.NODE_ENV !== "production") {
        return null;
    }

    const body = parseSessionValidationRequest(options);
    const response = await fetch(SESSION_VALIDATION_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        throw new Error(`Session validation failed: ${response.status} ${response.statusText}`);
    }

    const responseData = (await response.json()) as SessionValidationResponse;
    const userId = responseData.user?.id;
    const username = responseData.user?.username;
    if (typeof userId !== "string" || userId.length === 0) {
        throw new Error("Session validation response missing user.id");
    }
    if (typeof username !== "string" || username.length === 0) {
        throw new Error("Session validation response missing user.username");
    }

    return {
        userId,
        username,
    };
}

function getIndexedAuthData(currentIdx: number): UserAuthData {
    return {
        userId: `player-${currentIdx}`,
        username: `Player ${currentIdx}`,
    };
}

// Backup-platform path: when no HYTOPIA validation is available, accept a
// stable identity passed via join options (e.g. gamesbyhammy.cloud injects
// `localPlayerId` from the host page). TODO: validate this token against
// the backup platform's API once one exists — currently trusted as-is, so
// any client can spoof another user's ID. Acceptable for the
// HYTOPIA-shutdown stopgap; revisit before any open-internet exposure.
function getBackupPlatformAuthData(options: unknown): UserAuthData | null {
    if (!options || typeof options !== "object") return null;
    const data = options as Record<string, unknown>;
    const localPlayerId = data.localPlayerId;
    if (typeof localPlayerId !== "string" || localPlayerId.length === 0) return null;
    const localUsername = data.localUsername;
    return {
        userId: localPlayerId,
        username: typeof localUsername === "string" && localUsername.length > 0
            ? localUsername
            : localPlayerId,
    };
}

export function AuthPluginServer(): ServerPlugin {
    return {
        id: "auth",
        name: "Auth",
        version: "0.0.1",
        description: "HYTOPIA Auth plugin",
        author: "HYTOPIA",
        dependencies: [],
        init: async (runtime: ServerRuntime) => {
            const state = new AuthState();
            let currentIdx = 1;
            const authInterface = new AuthPluginInterfaceImpl(state);
            runtime.addInterface("auth", authInterface);

            // Dev-only: when DEV_PLAYER_ID is set, every non-production
            // auth resolves to the same fixed userId across refreshes
            // (instead of handing out fresh `player-1`, `player-2`, …
            // identities). Lets local playtesting actually exercise
            // persistent save state — combined with the file-backed
            // save fallback in plugin-save-states, achievements survive
            // a browser refresh during development.
            const pinnedDevPlayerId = process.env.DEV_PLAYER_ID?.trim() || null;
            if (pinnedDevPlayerId && process.env.NODE_ENV !== "production") {
                logger.info(`Dev mode: pinning auth to userId "${pinnedDevPlayerId}" (DEV_PLAYER_ID env)`);
            }

            runtime.setAuthHandler(async (client, options) => {
                const productionAuthData = await validateSessionInProduction(options);
                let authData: UserAuthData;
                const backupAuthData = productionAuthData ? null : getBackupPlatformAuthData(options);
                if (productionAuthData) {
                    authData = productionAuthData;
                } else if (pinnedDevPlayerId) {
                    // Pinned identity in dev — every connection uses the
                    // same userId/username, so save state survives refreshes.
                    authData = { userId: pinnedDevPlayerId, username: pinnedDevPlayerId };
                } else if (backupAuthData) {
                    authData = backupAuthData;
                } else {
                    authData = getIndexedAuthData(currentIdx);
                    currentIdx += 1;
                }
                const entry = new AuthEntry();

                entry.userId = authData.userId;
                entry.username = authData.username;
                state.players.set(client.sessionId, entry);

                logger.info(
                    `Authenticated ${authData.username} (${authData.userId}) for session ${client.sessionId}`,
                );

                return authData;
            });

            runtime.onClientLeave((client) => {
                state.players.delete(client.sessionId);
            });

            return state;
        }
    };
}

export type { AuthPluginInterface };