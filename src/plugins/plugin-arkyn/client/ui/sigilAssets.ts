// Vite eager glob import for sigil images. Resolves at build time to a
// static map of filename → URL.
//
// We only ship the 128×128 variants — every callsite passes size 128
// to getSigilImageUrl, and the smaller variants on disk (32x32, 64x64)
// are unused. Globbing them in just bloats the URL map at module init.
// If a future caller genuinely needs a smaller variant, add the size
// back to the glob and reintroduce the `size` parameter on
// getSigilImageUrl.
const modules = import.meta.glob("/assets/sigils/*-128x128.png", {
    eager: true,
    query: "?url",
    import: "default",
}) as Record<string, string>;

const urlMap: Record<string, string> = {};
for (const [path, url] of Object.entries(modules)) {
    // path = "/assets/sigils/voltage-128x128.png"
    // Key by sigil id (filename minus the size suffix) so callers
    // don't have to know which size variant we ship.
    const filename = path.split("/").pop()?.replace(".png", "") ?? "";
    const sigilId = filename.replace(/-128x128$/, "");
    urlMap[sigilId] = url;
}

/**
 * Get the resolved URL for a sigil image.
 * @param sigilId - The sigil ID (e.g. "voltage")
 */
export function getSigilImageUrl(sigilId: string): string {
    return urlMap[sigilId] ?? "";
}
