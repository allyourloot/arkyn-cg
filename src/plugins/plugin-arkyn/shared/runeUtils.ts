/**
 * Plain rune-data DTO shared by server and client. The Schema-backed
 * RuneInstance (in ArkynState.ts) wraps this for network sync; the
 * server-only RuneInstanceData (in createPouch.ts) and client-only
 * RuneClientData (in arkynStoreCore.ts) are structurally identical
 * to this and can be passed through the helpers below without
 * conversion thanks to TypeScript's structural typing.
 */
export interface RuneSpec {
    id: string;
    element: string;
    rarity: string;
    level: number;
}

/**
 * Strip a rune (Schema or DTO) down to its plain-data fields. Replaces
 * the previously-duplicated `snapshotRune` / `snapshotData` helpers in
 * handleApplyTarot.ts. Accepts any object with the four canonical
 * fields, so a Schema-backed RuneInstance and a plain RuneInstanceData
 * both work without explicit conversion.
 */
export function snapshotRune<T extends RuneSpec>(r: T): RuneSpec {
    return { id: r.id, element: r.element, rarity: r.rarity, level: r.level };
}
