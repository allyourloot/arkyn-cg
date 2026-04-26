import { CODEX_PACK_COST, RUNE_BAG_COST, type ElementType } from "./arkynConstants";

// Pack types live in the shop's "Packs" section. Each pack is a
// deferred-pick container: the player buys it, sees a picker of N
// random items, and picks one. Adding a future pack means a new entry
// here + a new picker handler — no other code touches the dispatcher.
export const PACK_TYPES = ["runeBag", "codexPack"] as const;
export type PackType = (typeof PACK_TYPES)[number];

export interface PackDefinition {
    /**
     * The `ShopItemState.itemType` value used both for the shop dispatcher
     * lookup (`SHOP_ITEM_HANDLERS[itemType]`) and the React rendering
     * branch in `ShopScreen`. Equal to the registry key.
     */
    itemType: PackType;
    name: string;
    cost: number;
    description: string;
    /**
     * Element name keyed into `ELEMENT_COLORS` to pick the dissolve
     * shader's edge-glow color when the pack flies to center and dissolves
     * before the picker mounts. Tunable per pack to fit its art.
     */
    dissolveElement: ElementType;
    /**
     * Image aspect ratio (width / height). Drives the WebGL plane scale
     * inside `ItemScene` so non-square pack art renders at correct
     * proportions inside the square card slot, and feeds the fly +
     * dissolve sizing in `ArkynOverlay`. 1 = square. <1 = taller than
     * wide (e.g. Codex Pack at 89/160 ≈ 0.556). >1 = wider than tall.
     */
    aspectRatio: number;
    /**
     * Visual size multiplier for the shop card render. The card slot is
     * fixed (140×140 max), but the ItemScene canvas extends 15% beyond
     * on each side (inset: -15%), so values up to 1.3 fit within the
     * canvas without clipping at the camera bounds. Use to bump up
     * non-square art that otherwise reads as small inside the square
     * slot. Defaults to 1.
     */
    displayScale?: number;
}

export const PACK_DEFINITIONS: Record<PackType, PackDefinition> = {
    runeBag: {
        itemType: "runeBag",
        name: "Rune Bag",
        cost: RUNE_BAG_COST,
        description: "Opens 4 random runes. Pick one to add permanently to your pouch.",
        dissolveElement: "earth",
        aspectRatio: 1, // 128x128 square
    },
    codexPack: {
        itemType: "codexPack",
        name: "Codex Pack",
        cost: CODEX_PACK_COST,
        description: "Opens 4 random scrolls. Pick one to upgrade that element.",
        dissolveElement: "arcane",
        aspectRatio: 89 / 160, // ≈ 0.556 — taller than wide
        displayScale: 1.3,     // fill the 130% canvas overflow so the tall card reads at parity with Rune Bag
    },
};
