// Vite eager glob import for Rune Bag images. Mirrors sigilAssets.ts /
// scrollAssets.ts, with one wrinkle: the on-disk filename contains a
// space (`rune bag-128x128.png`), so we normalize the key to
// `rune_bag-<size>x<size>` to keep callers free of the space.
const modules = import.meta.glob("/assets/items/bags/*.png", {
    eager: true,
    query: "?url",
    import: "default",
}) as Record<string, string>;

const urlMap: Record<string, string> = {};
for (const [path, url] of Object.entries(modules)) {
    const filename = path.split("/").pop()?.replace(".png", "") ?? "";
    const key = filename.replace(/\s+/g, "_");
    urlMap[key] = url;
}

/**
 * Get the Rune Bag image URL for a given size (32 / 64 / 128).
 * There is only one bag art today so no id param is needed.
 */
export function getRuneBagImageUrl(size: 32 | 64 | 128 = 128): string {
    return urlMap[`rune_bag-${size}x${size}`] ?? "";
}
