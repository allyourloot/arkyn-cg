// Vite eager glob for all pack art under
// `/assets/items/consumables/packs/`. Each pack today uses a single
// source PNG (`rune_pack.png`, `codex_pack.png`, `augury_pack.png`) —
// the sized-variant suffix code below is kept so future packs can opt
// into multi-resolution art without touching the loader.
//
// Keys are normalized (spaces → underscores, ".png" stripped) and
// indexed twice — once with any size suffix (when present) and once
// with just the pack id — so callers can request either form.
const modules = import.meta.glob([
    "/assets/items/consumables/packs/*.png",
], {
    eager: true,
    query: "?url",
    import: "default",
}) as Record<string, string>;

const urlMap: Record<string, string> = {};
const bareSizes: Record<string, number> = {};
for (const [path, url] of Object.entries(modules)) {
    const filename = path.split("/").pop()?.replace(".png", "") ?? "";
    const key = filename.replace(/\s+/g, "_");
    urlMap[key] = url;
    // Also index by the bare pack id (filename minus any "-<size>x<size>"
    // suffix). Lets callers do `getPackImageUrl("rune_pack")` and get
    // the largest available variant. Iteration order is glob-arbitrary,
    // so we track the size we last stored to prefer the largest variant.
    const bareMatch = key.match(/^(.+?)-(\d+)x\2$/);
    if (bareMatch) {
        const bareId = bareMatch[1];
        const size = Number(bareMatch[2]);
        if (size > (bareSizes[bareId] ?? 0)) {
            urlMap[bareId] = url;
            bareSizes[bareId] = size;
        }
    }
}

// Asset filenames use snake_case (`rune_pack`, `codex_pack`) but the
// PACK_TYPES keys used elsewhere are camelCase (`runePack`, `codexPack`).
// Normalize once at lookup so callers can pass either form.
function toSnakeCase(s: string): string {
    return s.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
}

/**
 * Get the pack image URL for a given pack id. Accepts either the
 * camelCase PackType (`"runePack"`, `"codexPack"`) or the underlying
 * snake_case asset key (`"rune_pack"`, `"codex_pack"`).
 *
 * If `size` is provided AND a sized variant exists (e.g.
 * `rune_pack-128x128.png`), that variant is returned. Otherwise falls
 * back to the bare id (which is what packs with single-source art use).
 */
export function getPackImageUrl(packId: string, size?: 32 | 64 | 128): string {
    const key = toSnakeCase(packId);
    if (size !== undefined) {
        const sized = urlMap[`${key}-${size}x${size}`];
        if (sized) return sized;
    }
    return urlMap[key] ?? "";
}
