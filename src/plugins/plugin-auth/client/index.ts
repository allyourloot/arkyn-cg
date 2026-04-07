import { ClientPlugin, ClientRuntime } from "@core/client";
import type { AuthState } from "../shared/AuthState";
import { AuthClientInterfaceImpl } from "./interfaces/AuthClientInterfaceImpl";
import { Logger } from "@core/shared/utils";
import { PluginState } from "@core/shared";

const logger = new Logger("AuthPluginClient");
const HEARTBEAT_INTERVAL_MS = 60_000;
const HEARTBEAT_BASE_URL = "https://prod.mvp.hytopia.com/Play/Matchmaking/Lobbies/Heartbeat";

type RoomJoinOptions = {
    lobbyId?: string;
    sessionToken?: string;
};

type BrowserLocation = {
    search: string;
    hash: string;
};

function extractJoinOptions(searchParams: URLSearchParams): RoomJoinOptions {
    const lobbyId = searchParams.get("lobbyId") ?? undefined;
    const sessionToken = searchParams.get("sessionToken") ?? undefined;

    return {
        lobbyId,
        sessionToken,
    };
}

function getBrowserLocation(): BrowserLocation | null {
    const maybeLocation = (globalThis as { location?: BrowserLocation }).location;
    if (
        !maybeLocation
        || typeof maybeLocation.search !== "string"
        || typeof maybeLocation.hash !== "string"
    ) {
        return null;
    }

    return maybeLocation;
}

function resolveRoomJoinOptions(): RoomJoinOptions | null {
    const location = getBrowserLocation();
    if (!location) {
        return null;
    }

    const fromSearch = extractJoinOptions(new URLSearchParams(location.search));
    if (fromSearch.lobbyId && fromSearch.sessionToken) {
        return fromSearch;
    }

    const hash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
    const fromHash = extractJoinOptions(new URLSearchParams(hash));
    if (fromHash.lobbyId && fromHash.sessionToken) {
        return fromHash;
    }

    const nestedClientUrl = new URLSearchParams(location.search).get("clientUrl");
    if (!nestedClientUrl) {
        return null;
    }

    try {
        const nested = new URL(nestedClientUrl);
        const fromNestedClientUrl = extractJoinOptions(nested.searchParams);
        if (fromNestedClientUrl.lobbyId && fromNestedClientUrl.sessionToken) {
            return fromNestedClientUrl;
        }
    } catch {
        return null;
    }

    return null;
}

async function sendLobbyHeartbeat(lobbyId: string, sessionToken: string): Promise<void> {
    const heartbeatUrl = `${HEARTBEAT_BASE_URL}/${encodeURIComponent(lobbyId)}`;
    const response = await fetch(heartbeatUrl, {
        method: "POST",
        headers: {
            Token: sessionToken,
        },
    });

    if (!response.ok) {
        throw new Error(`Heartbeat failed: ${response.status} ${response.statusText}`);
    }
}

function startLobbyHeartbeat(): void {
    const joinOptions = resolveRoomJoinOptions();
    if (!joinOptions?.lobbyId || !joinOptions.sessionToken) {
        logger.warn("Lobby heartbeat disabled: missing lobbyId/sessionToken");
        return;
    }

    const lobbyId = joinOptions.lobbyId;
    const sessionToken = joinOptions.sessionToken;

    const heartbeat = async () => {
        try {
            await sendLobbyHeartbeat(lobbyId, sessionToken);
            logger.info(`Lobby heartbeat sent for ${lobbyId}`);
        } catch (error) {
            logger.warn(
                `Lobby heartbeat failed for ${lobbyId}: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    };

    void heartbeat();
    globalThis.setInterval(() => {
        void heartbeat();
    }, HEARTBEAT_INTERVAL_MS);
}

export function AuthPluginClient(): ClientPlugin {
    return new ClientPlugin({
        id: "auth",
        name: "Auth",
        version: "0.0.1",
        description: "HYTOPIA Auth plugin client interface",
        author: "HYTOPIA",
        dependencies: [],
        init: async (runtime: ClientRuntime, state: PluginState) => {
            runtime.addInterface("auth", new AuthClientInterfaceImpl(state as AuthState));
            startLobbyHeartbeat();
            logger.info("Auth client interface initialized");
        },
    });
}

export type { AuthClientInterface, AuthClientUser } from "./interfaces/AuthClientInterface";
