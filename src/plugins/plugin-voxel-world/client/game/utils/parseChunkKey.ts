import { Logger } from "@core/shared/utils";

const logger = new Logger("parseChunkKey");
export function parseChunkKey(chunkKey: string) {
    const [xStr, zStr] = chunkKey.split(",");
    const x = Number(xStr);
    const z = Number(zStr);
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
        logger.warn(`Failed to parse chunk key '${chunkKey}'`);
        return null;
    }

    return { x, z };
}
