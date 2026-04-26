// Eagerly import all tarot card art so Vite can inline the URLs.
//
// File-name conventions are inconsistent:
//   - 0_theFool_1x.png, 0_theFool_2x.png  (camelCase, both sizes)
//   - 1_TheMagician_1x.png                (capital T)
//   - 8_justice_1x.png                    (lowercase noun-only)
//   - 15_devil.png + 15_devil_2x.png      (1x is missing the suffix!)
//
// Each TarotDefinition carries an exact `fileBasename` (e.g. "0_theFool",
// "15_devil") so the loader looks up `${basename}_1x.png` first and
// falls back to the bare `${basename}.png` for the one inconsistent
// file. The 2x variant always uses the `_2x` suffix.
const tarotModules = import.meta.glob("/assets/tarots/*.png", {
    eager: true,
    query: "?url",
    import: "default",
}) as Record<string, string>;

const tarotUrlMap = new Map<string, string>();

for (const [path, url] of Object.entries(tarotModules)) {
    const filename = path.split("/").pop()?.replace(".png", "") ?? "";
    tarotUrlMap.set(filename, url);
}

export type TarotDensity = "1x" | "2x";

/**
 * Resolve the URL for a tarot card image at the requested density.
 *
 * Looks up `${basename}_${density}` first; for "1x" requests, falls
 * back to the bare `${basename}` to handle the one inconsistently-
 * named file (`15_devil.png`). Returns "" if no matching asset
 * exists, which renders as a broken-image icon — caller's
 * responsibility to ensure the basename matches a real file.
 */
export function getTarotImageUrl(fileBasename: string, density: TarotDensity = "1x"): string {
    const sized = tarotUrlMap.get(`${fileBasename}_${density}`);
    if (sized) return sized;
    if (density === "1x") {
        const bare = tarotUrlMap.get(fileBasename);
        if (bare) return bare;
    }
    return "";
}
