// Eagerly import all 128x128 rune images so Vite can inline them
const runeModules = import.meta.glob('/assets/runes/128x128/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const runeUrlMap = new Map<string, string>();

for (const [path, url] of Object.entries(runeModules)) {
    // Extract element name from path: "/assets/runes/128x128/fire-128x128.png" -> "fire"
    const filename = path.split('/').pop() ?? '';
    const element = filename.replace('-128x128.png', '');
    runeUrlMap.set(element, url);
}

export function getRuneImageUrl(element: string): string {
    return runeUrlMap.get(element) ?? '';
}

// Also import base rarity images
const baseModules = import.meta.glob('/assets/runes/128x128/base/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const baseUrlMap = new Map<string, string>();

for (const [path, url] of Object.entries(baseModules)) {
    const filename = path.split('/').pop() ?? '';
    const rarity = filename.replace('-128x128.png', '');
    baseUrlMap.set(rarity, url);
}

export function getBaseRuneImageUrl(rarity: string): string {
    return baseUrlMap.get(rarity) ?? '';
}
