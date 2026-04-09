/**
 * Pub-sub primitive shared by every Arkyn store module. Splitting this out
 * lets `arkynStore` and `arkynAnimations` both import `notify`/`subscribe`
 * from a neutral place, breaking the circular-import risk that would
 * otherwise exist if `notify` lived in the data store and animations
 * needed it.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

export function notify(): void {
    for (const l of listeners) l();
}

export function subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
}

/**
 * Plain client mirror of a server-side RuneInstance Schema. Lives here so
 * both `arkynStore` (which mutates hand/pouch state) and `arkynAnimations`
 * (which animates flying/dissolving runes) can refer to the same shape
 * without depending on each other.
 */
export interface RuneClientData {
    id: string;
    element: string;
    rarity: string;
    level: number;
}
