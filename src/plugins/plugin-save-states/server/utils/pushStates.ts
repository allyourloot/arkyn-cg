import { Logger } from "@core/shared/utils";

const logger = new Logger("SaveStatesServer");
const KV_API_BASE = "http://prod.persuade-creative.hytopia.com/Play/KV/SetBulk";

export async function pushStates(
    apiKey: string,
    gameId: string,
    entries: Record<string, unknown>,
): Promise<boolean> {
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
            return false;
        }

        return true;
    } catch (error) {
        logger.warn(`SetBulk request failed: ${String(error)}`);
        return false;
    }
}
