import { Logger } from "@core/shared/utils";
import { isDevSaveEnabled, writeDevSaves } from "./devSaveStore";

const logger = new Logger("SaveStatesServer");
const KV_API_BASE = "http://prod.persuade-creative.hytopia.com/Play/KV/SetBulk";

const KV_KEY_PREFIX = "st:player-";

/**
 * Push the dirty save-state entries to the KV API and (in dev) also
 * mirror them to the local file store so playtesting survives a KV
 * outage. The flush worker treats a successful disk write as a flush
 * success in dev — that way the dirty queue clears even when KV is
 * permanently unreachable, instead of re-queuing every second.
 */
export async function pushStates(
    apiKey: string,
    gameId: string,
    entries: Record<string, unknown>,
): Promise<boolean> {
    let kvOk = false;
    try {
        const url = `${KV_API_BASE}/${encodeURIComponent(gameId)}`;
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "insomnia/2023.5.8",
                "X-Api-Key": apiKey,
            },
            body: JSON.stringify(entries),
        });

        if (!response.ok) {
            logger.warn(`SetBulk failed with status ${response.status}`);
        } else {
            kvOk = true;
        }
    } catch (error) {
        logger.warn(`SetBulk request failed: ${String(error)}`);
    }

    if (isDevSaveEnabled()) {
        // Mirror every batched entry to disk. Keys arrive as
        // `st:player-${userId}` (see flushWorker.ts), so strip the prefix
        // before handing them to the dev store. We unwrap `__version` here
        // so the on-disk JSON matches `FetchedPlayerState`'s shape, which
        // keeps `readDevSave` symmetric with `pushStates`.
        const devEntries: Array<{ userId: string; state: unknown; version: number }> = [];
        for (const [key, value] of Object.entries(entries)) {
            const userId = key.startsWith(KV_KEY_PREFIX) ? key.slice(KV_KEY_PREFIX.length) : key;
            const v = value as Record<string, unknown>;
            const { __version, ...state } = v;
            devEntries.push({
                userId,
                state,
                version: typeof __version === "number" ? __version : 0,
            });
        }
        const diskOk = await writeDevSaves(devEntries);
        // Treat the flush as successful when EITHER side acknowledged. In
        // a normal local-dev session KV will 503 forever and disk is the
        // only source of truth; in a healthy environment KV succeeds and
        // disk is just a redundant mirror.
        return kvOk || diskOk;
    }

    return kvOk;
}
