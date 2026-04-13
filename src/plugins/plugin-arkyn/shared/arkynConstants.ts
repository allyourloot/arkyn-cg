// Game constants
export const HAND_SIZE = 8;
export const MAX_PLAY = 5;
export const POUCH_SIZE = 52;
export const RUNES_PER_ELEMENT = 4;

// Per-round action budgets. These are the totals a player gets at the start
// of each round; future shop items will add/subtract to the per-player total.
export const CASTS_PER_ROUND = 3;
export const DISCARDS_PER_ROUND = 3;

export const ELEMENT_TYPES = [
    "air", "arcane", "death", "earth", "fire", "holy",
    "ice", "lightning", "poison", "psy", "shadow", "steel", "water",
] as const;

export type ElementType = (typeof ELEMENT_TYPES)[number];

export const COMBINABLE_ELEMENTS = [
    "fire", "water", "earth", "air", "ice", "lightning",
] as const;

export type CombinableElement = (typeof COMBINABLE_ELEMENTS)[number];

export const RARITY_TYPES = ["common", "uncommon", "rare", "legendary"] as const;
export type RarityType = (typeof RARITY_TYPES)[number];

// Scroll item configuration
export const SCROLL_COST = 2;
export const SCROLL_RUNE_BONUS = 2;   // +2 per-rune base damage per scroll
export const SHOP_SCROLL_COUNT = 2;   // scroll slots shown per shop visit

// Messages (client -> server)
export const ARKYN_JOIN = "arkyn:join";
export const ARKYN_CAST = "arkyn:cast";
export const ARKYN_DISCARD = "arkyn:discard";
export const ARKYN_READY = "arkyn:ready";
export const ARKYN_NEW_RUN = "arkyn:new_run";
export const ARKYN_BUY_ITEM = "arkyn:buy_item";
