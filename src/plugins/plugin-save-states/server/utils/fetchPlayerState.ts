import { Logger } from "@core/shared/utils";

const logger = new Logger("SaveStatesServer");
const KV_API_BASE = "http://prod.persuade-creative.hytopia.com/Play/KV/Get";

export type FetchedPlayerState = {
    state: Record<string, unknown>;
    version: number;
};

export async function fetchPlayerState(apiKey: string, gameId: string, userId: string): Promise<FetchedPlayerState | null> {
    try {
        const url = `${KV_API_BASE}/${encodeURIComponent(gameId)}/st:player-${encodeURIComponent(userId)}`;
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "User-Agent": "insomnia/2023.5.8",
                "X-Api-Key": apiKey,
            },
        });

        if (response.status === 404) {
            return { state: {}, version: 0 };
        }

        if (!response.ok) {
            logger.warn(`KV API returned ${response.status} for user ${userId}`);
            return null;
        }

        const json = await response.json();
        const value = json?.value as Record<string, unknown> | undefined;
        if (!value || typeof value !== "object") return null;

        const { __version, ...state } = value;

        return {
            state,
            version: typeof __version === "number" ? __version : 0,
        };
    } catch (error) {
        logger.warn(`Failed to fetch save state for ${userId}: ${String(error)}`);
        return null;
    }
}
