import { Logger } from "@core/shared/utils";
import { pushStates } from "../utils/pushStates";

const logger = new Logger("SaveStatesServer");

export function startFlushWorker(
    apiKey: string,
    gameId: string,
    cache: Map<string, unknown>,
    versions: Map<string, number>,
    proxies: Map<string, unknown>,
    dirty: Set<string>,
    pendingCleanup: Set<string>,
): void {
    async function flush() {
        try {
            if (dirty.size > 0) {
                const userIds = [...dirty];
                dirty.clear();

                const entries: Record<string, unknown> = {};
                for (const userId of userIds) {
                    const state = cache.get(userId);
                    if (state === undefined) continue;
                    const version = versions.get(userId) ?? 0;
                    entries[`st:player-${userId}`] = { ...(state as object), __version: version };
                }

                if (Object.keys(entries).length > 0) {
                    const success = await pushStates(apiKey, gameId, entries);
                    if (!success) {
                        for (const userId of userIds) {
                            if (cache.has(userId)) dirty.add(userId);
                        }
                    } else {
                        logger.info(`Flushed ${Object.keys(entries).length} save states`);
                    }
                }
            }

            if (pendingCleanup.size > 0) {
                for (const userId of pendingCleanup) {
                    if (dirty.has(userId)) continue;
                    cache.delete(userId);
                    versions.delete(userId);
                    proxies.delete(userId);
                    pendingCleanup.delete(userId);
                }
            }
        } catch (error) {
            logger.warn(`Flush worker error: ${String(error)}`);
        }

        setTimeout(flush, 1000);
    }

    setTimeout(flush, 1000);
}
