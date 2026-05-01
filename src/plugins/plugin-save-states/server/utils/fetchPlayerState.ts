import { Logger } from "@core/shared/utils";
import { isDevSaveEnabled, readDevSave } from "./devSaveStore";

const logger = new Logger("SaveStatesServer");
const KV_API_BASE = "http://prod.persuade-creative.hytopia.com/Play/KV/Get";

export type FetchedPlayerState = {
    state: Record<string, unknown>;
    version: number;
};

/**
 * Resolve a player's save state. Production-side this is purely the
 * remote KV API; in development we additionally fall back to the
 * local file-backed store so playtesting survives KV outages and a
 * brand-new player gets an empty save instead of a missing one.
 *
 * Return semantics:
 *   - non-null  → cache it, mark loaded, downstream is happy
 *   - null      → save state remains "unloaded" for this user (production
 *                 KV failure path; we deliberately keep the legacy behavior
 *                 so a real outage still surfaces)
 */
export async function fetchPlayerState(apiKey: string, gameId: string, userId: string): Promise<FetchedPlayerState | null> {
    let kvFailed = false;
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
            // No persisted save for this user — give them an empty slate
            // (or hydrate from a local dev file if one exists).
            return (await readDevSave(userId)) ?? { state: {}, version: 0 };
        }

        if (response.ok) {
            const json = (await response.json()) as { value?: Record<string, unknown> } | null | undefined;
            const value = json?.value;
            if (value && typeof value === "object") {
                const { __version, ...state } = value;
                return {
                    state,
                    version: typeof __version === "number" ? __version : 0,
                };
            }
            // 200 with no value — treat as "no save yet."
            return (await readDevSave(userId)) ?? { state: {}, version: 0 };
        }

        logger.warn(`KV API returned ${response.status} for user ${userId}`);
        kvFailed = true;
    } catch (error) {
        logger.warn(`Failed to fetch save state for ${userId}: ${String(error)}`);
        kvFailed = true;
    }

    // KV unreachable. In dev, fall back to the local file (or an empty
    // save) so achievements and lifetime stats persist across refreshes
    // even when the remote API is down. In production, propagate the
    // failure as `null` so the outage surfaces upstream rather than
    // silently masking it with a fresh save.
    if (kvFailed && isDevSaveEnabled()) {
        const fromFile = await readDevSave(userId);
        if (fromFile) {
            logger.info(`Loaded dev save for ${userId} from disk (KV unavailable)`);
            return fromFile;
        }
        logger.info(`KV unavailable and no dev save for ${userId} — issuing fresh empty save`);
        return { state: {}, version: 0 };
    }

    return null;
}
