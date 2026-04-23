import { PluginState } from "../shared";
import { Logger } from "../shared/utils";
import type { ClientPlugin } from "./ClientPlugin";
import { ClientRuntime } from "./ClientRuntime";
import { Connection } from "./Connection";

const logger = new Logger("ClientBuilder");

function parseValidPort(value: string | null): string | null {
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        return null;
    }

    return `${parsed}`;
}

function resolveRequestedServerPort(): string | null {
    const fromSearch = parseValidPort(new URLSearchParams(window.location.search).get("serverPort"));
    if (fromSearch) return fromSearch;

    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
    const fromHash = parseValidPort(new URLSearchParams(hash).get("serverPort"));
    if (fromHash) return fromHash;

    const nestedClientUrl = new URLSearchParams(window.location.search).get("clientUrl");
    if (!nestedClientUrl) return null;

    try {
        const nested = new URL(nestedClientUrl);
        return parseValidPort(nested.searchParams.get("serverPort"));
    } catch {
        return null;
    }
}

type RoomJoinOptions = {
    lobbyId?: string;
    sessionToken?: string;
};

function extractJoinOptions(searchParams: URLSearchParams): RoomJoinOptions {
    const lobbyId = searchParams.get("lobbyId") ?? undefined;
    const sessionToken = searchParams.get("sessionToken") ?? undefined;

    return {
        lobbyId,
        sessionToken,
    };
}

function resolveRoomJoinOptions(): Record<string, unknown> | undefined {
    const fromSearch = extractJoinOptions(new URLSearchParams(window.location.search));
    if (fromSearch.lobbyId && fromSearch.sessionToken) {
        return fromSearch;
    }

    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
    const fromHash = extractJoinOptions(new URLSearchParams(hash));
    if (fromHash.lobbyId && fromHash.sessionToken) {
        return fromHash;
    }

    const nestedClientUrl = new URLSearchParams(window.location.search).get("clientUrl");
    if (!nestedClientUrl) {
        return undefined;
    }

    try {
        const nested = new URL(nestedClientUrl);
        const fromNestedClientUrl = extractJoinOptions(nested.searchParams);
        if (fromNestedClientUrl.lobbyId && fromNestedClientUrl.sessionToken) {
            return fromNestedClientUrl;
        }
    } catch {
        return undefined;
    }

    return undefined;
}

export class ClientBuilder {
    private readonly _serverUrl: string;
    private readonly _roomJoinOptions?: Record<string, unknown>;
    private readonly _plugins: ClientPlugin[] = [];
    
    constructor(serverUrl?: string) {
        if (!serverUrl) {
            const protocol = window.location.protocol === "https:" ? "wss" : "ws";
            const requestedPort = resolveRequestedServerPort();
            // Dev mode heuristic: when the page is served from Vite's dev
            // port (8180), the Colyseus server lives on 8181 on the same
            // host. This covers both `local.hytopiahosting.com:8180` and
            // mobile access via the `*.dns-is-boring-we-do-ip-addresses`
            // wildcard host — the old exact-hostname check missed the
            // latter and caused mobile clients to open WSS to 8180, where
            // Vite is listening (not Colyseus). In production builds the
            // client is served by Colyseus itself, so the port already
            // matches and this branch is a no-op.
            const fallbackPort = window.location.port === "8180" ? "8181" : window.location.port;
            const port = requestedPort ?? fallbackPort;
            serverUrl = `${protocol}://${window.location.hostname}:${port}`;
        }
        this._serverUrl = serverUrl;
        this._roomJoinOptions = resolveRoomJoinOptions();
    }

    public addPlugin(plugin: ClientPlugin) {
        this._plugins.push(plugin);
    }

    public async build() : Promise<ClientRuntime> {
        const connection = new Connection(this._serverUrl, this._roomJoinOptions);
        try {
            await connection.connect();
            logger.info(`Connected to server ${connection.room?.roomId ?? "unknown"}`);
            
            // Wait for the state to be ready
            await new Promise((resolve) => connection.room?.onStateChange(() => resolve(true)));
            logger.info("Server-driven state ready");
        }
        catch(e) {
            logger.error(`Failed to connect to server: ${e instanceof Error ? e.message : String(e)}`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
            document.location.reload();
            throw e;
        }

        // Create runtime and initialize plugins
        logger.info("Setting up runtime...");
        const runtime = new ClientRuntime(connection);
        runtime.addInterface("connection", {
            get room() {
                return connection.room;
            },
        });

        for (const plugin of this._plugins) {
            const state = connection.room?.state.plugins.get(plugin.id);
            if (!state && !plugin.clientOnly) {
                const message = `Server-driven state for plugin ${plugin.id} not found`;
                logger.warn(message);
            }

            logger.info(`Initializing plugin ${plugin.id}`);
            await plugin.init(runtime, state ?? new PluginState());
            logger.info(`Initialized plugin ${plugin.id}`);
        }
        logger.info(`Runtime setup complete. ${this._plugins.length} plugins initialized`);
        return runtime;
    }
}