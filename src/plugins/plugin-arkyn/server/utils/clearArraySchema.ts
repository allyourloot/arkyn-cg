import type { ArraySchema } from "@colyseus/schema";

/**
 * Empty a Colyseus `ArraySchema` in place. The Schema doesn't expose a
 * single "clear" method, so the canonical way is to pop until empty —
 * this helper just makes the intent (and the loop) explicit at call sites.
 */
export function clearArraySchema<T>(arr: ArraySchema<T>): void {
    while (arr.length > 0) arr.pop();
}
