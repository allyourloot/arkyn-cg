/**
 * Eager glob loader for scroll item images. Same pattern as runeAssets.ts —
 * builds a Map<element, resolvedUrl> at module load so getScrollImageUrl()
 * is synchronous and allocation-free at call time.
 */

const scrollModules = import.meta.glob(
    "/assets/items/consumables/scrolls/*.png",
    { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

const scrollUrlMap = new Map<string, string>();
for (const [path, url] of Object.entries(scrollModules)) {
    const filename = path.split("/").pop() ?? "";
    // scroll-fire.png → "fire"
    const element = filename.replace("scroll-", "").replace(".png", "");
    scrollUrlMap.set(element, url);
}

export function getScrollImageUrl(element: string): string {
    return scrollUrlMap.get(element) ?? "";
}
