// Eagerly import 2x tarot card art so Vite can inline the URLs.
//
// File-name conventions for 2x are consistent: `${basename}_2x.png`
// (e.g. "0_theFool_2x.png", "15_devil_2x.png"). The 1x variants and
// the legacy bare "15_devil.png" are unused — every callsite uses 2x
// — so we don't glob them in.
const tarotModules = import.meta.glob("/assets/tarots/*_2x.png", {
    eager: true,
    query: "?url",
    import: "default",
}) as Record<string, string>;

const tarotUrlMap = new Map<string, string>();

for (const [path, url] of Object.entries(tarotModules)) {
    const filename = path.split("/").pop()?.replace(".png", "") ?? "";
    // Strip the "_2x" suffix so callers can look up by bare basename.
    const basename = filename.replace(/_2x$/, "");
    tarotUrlMap.set(basename, url);
}

/**
 * Resolve the URL for a tarot card image. Returns "" if no matching
 * asset exists, which renders as a broken-image icon — caller's
 * responsibility to ensure the basename matches a real file.
 */
export function getTarotImageUrl(fileBasename: string): string {
    return tarotUrlMap.get(fileBasename) ?? "";
}
