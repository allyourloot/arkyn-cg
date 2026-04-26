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

// Elements in the Grimoire's Arcane Cluster — see ARCANE_CLUSTER_PAIRS in
// InfoModal.tsx. Any rune whose element is in this set counts as an Arcane
// Cluster rune. Used by Arcana-style sigils that reward clustering these
// elements in a cast.
//
// Note: holy/death/poison/steel are "bridge" elements that also appear in
// Elemental Cluster synergies, but canonically they're still Arcane Cluster
// runes for sigil purposes. If a future cluster is carved out for the
// bridge elements, drop them from this list and revisit which sigils
// target which set.
export const ARCANE_CLUSTER_ELEMENTS = [
    "arcane", "psy", "shadow", "holy", "death", "poison", "steel",
] as const;

export const RARITY_TYPES = ["common", "uncommon", "rare", "legendary"] as const;
export type RarityType = (typeof RARITY_TYPES)[number];

/** Type-guard — narrows an arbitrary string to a canonical RarityType. */
export function isRarity(s: string): s is RarityType {
    return (RARITY_TYPES as readonly string[]).includes(s);
}

/** Type-guard — narrows an arbitrary string to a canonical ElementType. */
export function isElement(s: string): s is ElementType {
    return (ELEMENT_TYPES as readonly string[]).includes(s);
}

// Scroll item configuration
export const SCROLL_COST = 2;
export const SCROLL_RUNE_BONUS = 2;   // +2 per-rune base damage per scroll

// Sigil item configuration
export const MAX_SIGILS = 6;          // max sigils a player can hold
export const SHOP_SIGIL_COUNT = 2;    // sigil slots shown per shop visit

// Shop reroll configuration. Each reroll costs this much gold and
// re-rolls ONLY the sigil slots (pack slots stay put). The player's
// `shopRerollCount` seeds the new roll so repeat rerolls are
// deterministic per run seed + round + reroll index.
export const REROLL_COST = 3;

// Pack section — the renamed Consumables row that holds pack-type shop
// items (Rune Bag, Codex Pack, …). Each shop visit rolls SHOP_PACK_COUNT
// pack slots uniformly from PACK_TYPES (with replacement, so a shop can
// show 2 of the same pack type).
export const SHOP_PACK_COUNT = 2;

// Consumable inventory
export const MAX_CONSUMABLES = 2;     // max consumable items a player can hold

// Rune Bag item configuration. Buying a bag shows a picker of 4 random
// runes (random element + weighted-random rarity). The player picks one
// (or skips) — the picked rune is permanently added to their pouch for
// the rest of the run. There is no per-shop cap: if a shop rolls 2
// Rune Bags, the player may buy both. The only purchase gate is the
// shared "no other pack picker is currently open" rule below.
export const RUNE_BAG_COST = 4;
export const RUNE_BAG_CHOICES = 4;          // runes shown in the picker

// Codex Pack item configuration. Buying a pack shows a picker of 4
// distinct random scroll elements. The player picks one (or skips) —
// the picked element gets +1 scroll level (or +N with Scroll God). No
// per-shop cap (same rule as Rune Bag).
export const CODEX_PACK_COST = 4;
export const CODEX_PACK_CHOICES = 4;        // scrolls shown in the picker

// Augury Pack item configuration. Buying a pack samples N runes from the
// player's current pouch and offers M tarot cards. The player picks 1
// tarot and applies its effect to selected runes (or 0 runes for
// pouch-wide tarots like Judgement / World). Other tarots are discarded.
// The rune count matches HAND_SIZE so the picker row reads visually
// like the player's hand. Same "no other pack picker is open" gate as
// Rune Bag and Codex Pack.
export const AUGURY_PACK_COST = 4;
export const AUGURY_PACK_RUNE_CHOICES = 8;  // matches HAND_SIZE
export const AUGURY_PACK_TAROT_CHOICES = 5;
export const TAROT_BANISH_GOLD = 3;          // Tower per-rune payout
export const WORLD_LEGENDARY_CHANCE = 0.20;  // The World — split between Rare (1 - this) and Legendary

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
// Reorder owned sigils. Payload: { fromIndex: number; toIndex: number }
// Required because sigil order is load-bearing (e.g. Mimic copies the
// effect of the sigil immediately to its right — see sigilEffects.ts).
export const ARKYN_REORDER_SIGILS = "arkyn:reorder_sigils";
export const ARKYN_USE_CONSUMABLE = "arkyn:use_consumable";
// Rune-bag picker flow. Payload: { index: number | null }
//   index = number  -> player selected that rune (adds to pouch permanently)
//   index = null    -> player skipped (no rune added, no refund)
export const ARKYN_PICK_BAG_RUNE = "arkyn:pick_bag_rune";
// Codex-pack picker flow. Payload: { index: number | null }
//   index = number  -> player selected that scroll (grants scroll level(s))
//   index = null    -> player skipped (no scroll granted, no refund)
export const ARKYN_PICK_CODEX_SCROLL = "arkyn:pick_codex_scroll";
// Augury-pack apply flow. Payload:
//   { tarotId: string, runeIndices: number[], element?: string }
//     -> apply that tarot to the selected picker runes (and optional
//        chosen element for tarots whose effect needs it).
//   { tarotId: null }
//     -> player skipped the pack (no effect, no refund).
export const ARKYN_APPLY_TAROT = "arkyn:apply_tarot";
// Reroll the sigil section of the shop. No payload. Costs REROLL_COST
// gold and regenerates the SHOP_SIGIL_COUNT sigil slots (scrolls + rune
// bags are preserved in place).
export const ARKYN_REROLL_SHOP = "arkyn:reroll_shop";

// Debug-only message for dev testing. Grants a specific sigil to the
// player without going through the shop (no gold cost, bypasses the
// rarity-weighted shop roll). Wired to a browser-console helper on the
// client — see `client/debugCommands.ts`. Payload: { sigilId: string }
export const ARKYN_DEBUG_GRANT_SIGIL = "arkyn:debug_grant_sigil";
