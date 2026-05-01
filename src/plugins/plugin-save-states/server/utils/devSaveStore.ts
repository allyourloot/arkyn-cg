import { promises as fs } from "node:fs";
import path from "node:path";
import { Logger } from "@core/shared/utils";

/**
 * Local-disk fallback for save state in development. Active only when
 * `NODE_ENV !== "production"`. Lets `pnpm dev` actually persist player
 * state across server restarts and browser refreshes when the remote
 * Hytopia KV API is unavailable (e.g. returning 503 against a
 * non-deployed gameId).
 *
 * Path: `<repo>/.dev-saves/<userId>.json` by default, or `DEV_SAVES_DIR`
 * if set. Files are JSON-formatted as `{ state, version }` so a manual
 * tweak via your editor stays valid.
 *
 * Production paths (`fetchPlayerState` / `pushStates`) skip this layer
 * entirely — the only source of truth in prod is the KV API.
 */

const logger = new Logger("DevSaveStore");

const DEV_SAVES_DIR_DEFAULT = path.resolve(process.cwd(), ".dev-saves");
const DEV_SAVES_DIR = process.env.DEV_SAVES_DIR
    ? path.resolve(process.env.DEV_SAVES_DIR)
    : DEV_SAVES_DIR_DEFAULT;

export function isDevSaveEnabled(): boolean {
    return process.env.NODE_ENV !== "production";
}

/**
 * Resolve a userId to its on-disk JSON path. Sanitizes the userId so a
 * malicious value (e.g. `../etc/passwd`) cannot escape the saves dir —
 * only `[a-zA-Z0-9_-]` survives, everything else becomes `_`.
 */
function userPath(userId: string): string {
    const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(DEV_SAVES_DIR, `${safe}.json`);
}

export interface DevSaveRecord {
    state: Record<string, unknown>;
    version: number;
}

/** Read a single user's save from disk. Returns null if missing/invalid. */
export async function readDevSave(userId: string): Promise<DevSaveRecord | null> {
    if (!isDevSaveEnabled()) return null;
    try {
        const buf = await fs.readFile(userPath(userId), "utf8");
        const parsed = JSON.parse(buf) as { state?: Record<string, unknown>; version?: number };
        if (!parsed || typeof parsed !== "object" || !parsed.state || typeof parsed.state !== "object") {
            return null;
        }
        return {
            state: parsed.state,
            version: typeof parsed.version === "number" ? parsed.version : 0,
        };
    } catch (err) {
        const code = (err as NodeJS.ErrnoException | undefined)?.code;
        // ENOENT is the normal "no save yet" case for a fresh dev player —
        // not an error worth logging.
        if (code === "ENOENT") return null;
        logger.warn(`Failed to read dev save for ${userId}: ${String(err)}`);
        return null;
    }
}

/**
 * Write a batch of saves to disk. Returns true on full success. Used by
 * the flush worker so a single sweep can persist everything that was
 * marked dirty since last flush.
 */
export async function writeDevSaves(
    entries: ReadonlyArray<{ userId: string; state: unknown; version: number }>,
): Promise<boolean> {
    if (!isDevSaveEnabled()) return false;
    if (entries.length === 0) return true;
    try {
        await fs.mkdir(DEV_SAVES_DIR, { recursive: true });
        for (const entry of entries) {
            const body = JSON.stringify(
                { state: entry.state, version: entry.version },
                null,
                2,
            );
            await fs.writeFile(userPath(entry.userId), body, "utf8");
        }
        return true;
    } catch (err) {
        logger.warn(`Failed to write dev saves: ${String(err)}`);
        return false;
    }
}
