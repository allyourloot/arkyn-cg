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

// Sigil item configuration
export const MAX_SIGILS = 6;          // max sigils a player can hold
export const SHOP_SIGIL_COUNT = 2;    // sigil slots shown per shop visit

// Consumable inventory
export const MAX_CONSUMABLES = 2;     // max consumable items a player can hold

// Rune Bag item configuration. Buying a bag shows a picker of 4 random
// runes (random element + weighted-random rarity). The player picks one
// (or skips) — the picked rune is permanently added to their pouch for
// the rest of the run.
export const RUNE_BAG_COST = 4;
export const SHOP_RUNE_BAG_COUNT = 1;       // bag slots shown per shop visit
export const RUNE_BAG_CHOICES = 4;          // runes shown in the picker
export const MAX_RUNE_BAGS_PER_SHOP = 1;    // max bags purchasable per shop
// Per-slot rarity weights used by rollBagRunes. Tuned so bags feel
// exciting without making rare/legendary commonplace: at 4 slots per
// bag these weights produce ~11% of bags containing a legendary and
// ~52% containing at least one rare-or-better.
export const RUNE_BAG_RARITY_WEIGHTS: Record<RarityType, number> = {
    common: 60,
    uncommon: 25,
    rare: 12,
    legendary: 3,
};

// Sigil effect values (proc chances, RNG offsets, mult bonuses, etc.)
// live in their category-specific registries in `shared/sigilEffects.ts`.
// See: SIGIL_PROCS (Voltage), SIGIL_HAND_MULT (Synapse), etc.

// Messages (client -> server)
export const ARKYN_JOIN = "arkyn:join";
export const ARKYN_CAST = "arkyn:cast";
export const ARKYN_DISCARD = "arkyn:discard";
export const ARKYN_READY = "arkyn:ready";
export const ARKYN_COLLECT_ROUND_GOLD = "arkyn:collect_round_gold";
export const ARKYN_NEW_RUN = "arkyn:new_run";
export const ARKYN_BUY_ITEM = "arkyn:buy_item";
export const ARKYN_SELL_SIGIL = "arkyn:sell_sigil";
export const ARKYN_USE_CONSUMABLE = "arkyn:use_consumable";
// Rune-bag picker flow. Payload: { index: number | null }
//   index = number  -> player selected that rune (adds to pouch permanently)
//   index = null    -> player skipped (no rune added, no refund)
export const ARKYN_PICK_BAG_RUNE = "arkyn:pick_bag_rune";
