// Vite eager glob import for sigil images. Resolves at build time to a
// static map of filename → URL, mirroring scrollAssets.ts's pattern.
const modules = import.meta.glob("/assets/sigils/*.png", {
    eager: true,
    query: "?url",
    import: "default",
}) as Record<string, string>;

// Map: "voltage-64x64" → url, keyed by "{id}-{size}x{size}"
const urlMap: Record<string, string> = {};
for (const [path, url] of Object.entries(modules)) {
    // path = "/assets/sigils/voltage-64x64.png"
    const filename = path.split("/").pop()?.replace(".png", "") ?? "";
    urlMap[filename] = url;
}

/**
 * Get the resolved URL for a sigil image.
 * @param sigilId - The sigil ID (e.g. "voltage")
 * @param size - Image size: 32, 64, or 128. Defaults to 64.
 */
export function getSigilImageUrl(sigilId: string, size: 32 | 64 | 128 = 64): string {
    return urlMap[`${sigilId}-${size}x${size}`] ?? "";
}
