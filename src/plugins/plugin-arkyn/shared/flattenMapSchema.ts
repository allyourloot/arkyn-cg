import type { MapSchema } from "@colyseus/schema";

/**
 * Copy a Colyseus `MapSchema<string, V>` into a plain `Record<string, V>`.
 *
 * Several sigil helpers (accumulator xMult, inventory-mult) take a plain
 * object so they don't need to import Colyseus types. The conversion
 * was inlined at each call site as `map.forEach((v, k) => { out[k] = v; })`;
 * this helper collapses the 3-line pattern into a single call.
 */
export function flattenMapSchema<V>(map: MapSchema<V>): Record<string, V> {
    const out: Record<string, V> = {};
    map.forEach((value, key) => { out[key] = value; });
    return out;
}
