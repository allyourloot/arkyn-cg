// Eagerly import all 128x128 spellbook images so Vite can inline them.
// Each spellbook lives in its own folder under assets/spellbooks/<id>/ so
// adding a new book is as simple as dropping in a new directory.
const spellbookModules = import.meta.glob('/assets/spellbooks/*/*-128x128.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const spellbookUrlMap = new Map<string, string>();

for (const [path, url] of Object.entries(spellbookModules)) {
    // Extract spellbook id from the parent folder:
    // "/assets/spellbooks/standard/standard-128x128.png" -> "standard"
    const parts = path.split('/');
    const id = parts[parts.length - 2] ?? '';
    spellbookUrlMap.set(id, url);
}

export function getSpellbookImageUrl(id: string): string {
    return spellbookUrlMap.get(id) ?? '';
}
