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

            runtime.setAuthHandler(async (client, options) => {
                const productionAuthData = await validateSessionInProduction(options);
                const authData = productionAuthData ?? getIndexedAuthData(currentIdx);
                if (!productionAuthData) {
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