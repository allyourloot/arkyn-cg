import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";
import { PluginState } from "@core/shared";

export class ShopItemState extends Schema {
    @type("string") itemType = "";
    @type("string") element = "";
    @type("number") cost = 0;
    @type("boolean") purchased = false;
}

export class RuneInstance extends Schema {
    @type("string") id = "";
    @type("string") element = "";
    @type("string") rarity = "common";
    @type("number") level = 1;
}

export class EnemyState extends Schema {
    @type("string") name = "";
    @type("number") maxHp = 0;
    @type("number") currentHp = 0;
    @type("string") element = "";
    @type(["string"]) resistances = new ArraySchema<string>();
    @type(["string"]) weaknesses = new ArraySchema<string>();
    @type("boolean") isBoss = false;
    @type("string") debuff = "";
}

export class ArkynPlayerState extends Schema {
    @type([RuneInstance]) hand = new ArraySchema<RuneInstance>();
    @type([RuneInstance]) pouch = new ArraySchema<RuneInstance>();
    @type("number") pouchSize = 0;
    @type("number") handSize = 8;
    @type("string") lastSpellName = "";
    @type("number") lastSpellTier = 0;
    @type("number") lastDamage = 0;
    @type("number") castsRemaining = 3;
    @type("number") discardsRemaining = 3;
    // Persistent currency. `gold` is the running total a player has banked
    // across rounds. The `lastRoundGold*` fields are the breakdown for the
    // most recent enemy defeat — the round-end overlay reads them to play
    // the typewriter reward animation. They reset at the start of each
    // round so a stale breakdown can never flash on screen.
    @type("number") gold = 0;
    @type("number") lastRoundGoldBase = 0;
    @type("number") lastRoundGoldHandsBonus = 0;
    @type("number") lastRoundGoldHandsCount = 0;
    // Summed gold from owned end-of-round-gold sigils (Plunder et al.) staged
    // on the killing blow. The RoundEnd overlay derives per-sigil rows by
    // walking the player's owned sigils against SIGIL_END_OF_ROUND_GOLD —
    // this field is the authoritative total paid out on collect.
    @type("number") lastRoundGoldSigilBonus = 0;
    // Flipped true once the client has fired ARKYN_COLLECT_ROUND_GOLD for
    // the current round_end episode. Prevents double-crediting if the
    // RoundEnd overlay unmounts + remounts before the player hits
    // Continue. Reset to false by `handleCast` on the next killing blow.
    @type("boolean") lastRoundGoldCollected = false;

    // Run stats — synced to client for the game-over screen.
    @type("number") runTotalDamage = 0;
    @type("number") runTotalCasts = 0;
    @type("number") runTotalDiscards = 0;
    @type("number") runHighestSingleCast = 0;
    @type("string") runFavoriteSpell = "";
    @type("number") runEnemiesDefeated = 0;
    @type("number") runGoldEarned = 0;

    // Personal bests — loaded from save data on join.
    @type("number") bestRound = 0;
    @type("number") bestSingleCast = 0;

    // Scroll upgrade levels per element — how many scrolls of each element
    // the player has purchased this run. Drives the per-element Base/Mult
    // bonus in calculateSpellDamage. Resets on new run (fresh schema).
    @type({ map: "number" }) scrollLevels = new MapSchema<number>();

    // Sigils owned this run — up to MAX_SIGILS (6). Each entry is a sigil
    // ID (e.g. "voltage"). Resets on new run (fresh schema).
    @type(["string"]) sigils = new ArraySchema<string>();

    // Per-sigil persistent accumulator values (Executioner pattern). Keys
    // are sigil IDs in `SIGIL_ACCUMULATOR_XMULT`; values are the current
    // xMult factor that grew from in-game events (e.g. critical hits).
    // Persists across rounds within a run. Resets on new run (fresh schema).
    @type({ map: "number" }) sigilAccumulators = new MapSchema<number>();

    // Consumable items — up to MAX_CONSUMABLES (2). Each entry is an
    // element name representing a scroll consumable (e.g. "fire").
    // Players click USE to apply the scroll (increments scrollLevels).
    @type(["string"]) consumables = new ArraySchema<string>();

    // Element whose enemy resistance is nullified this round by Binoculars
    // (or any future dynamic resist-ignore sigil). Empty string = nothing
    // disabled. Picked at round start via the onRoundStart lifecycle hook
    // and cleared by initPlayerForRound at the next round so stale picks
    // never leak across matchups.
    @type("string") disabledResistance = "";

    // Current shop inventory — populated on entering the shop phase and
    // synced to the client for rendering. Each entry tracks whether the
    // item has been purchased so the client can grey it out.
    @type([ShopItemState]) shopItems = new ArraySchema<ShopItemState>();

    // Runes the player has permanently added to their pouch this run via
    // Rune Bag picks. `createPouch` appends these to the base 52 each
    // round so they persist across round resets. Empty on fresh runs.
    @type([RuneInstance]) acquiredRunes = new ArraySchema<RuneInstance>();

    // In-flight Rune Bag picker state. Non-empty = the player has bought
    // a bag this shop visit and is currently viewing the 4 choices; the
    // client hides the shop's middle column and shows the picker. Cleared
    // on Select or Skip. Does not persist across disconnects.
    @type([RuneInstance]) pendingBagRunes = new ArraySchema<RuneInstance>();

    // How many bags the player has bought during the current shop visit.
    // Reset to 0 on shop entry. Used to uniquely seed each bag's RNG and
    // to enforce MAX_RUNE_BAGS_PER_SHOP.
    @type("number") bagPurchaseCount = 0;

    // How many times the player has discarded during the current round.
    // Reset to 0 in `initPlayerForRound`; incremented on each successful
    // discard BEFORE sigil discard-hooks fire, so the first discard carries
    // `discardNumber: 1` (consumed by hooks like Banish).
    @type("number") discardsUsedThisRound = 0;

    // How many times the player has cast during the current round. Mirrors
    // `discardsUsedThisRound` on the cast side. Incremented in `handleCast`
    // BEFORE sigil cast-hooks fire, so the first cast carries
    // `castNumber: 1` (consumed by hooks like Magic Mirror).
    @type("number") castsUsedThisRound = 0;

    // Runes permanently removed from the pouch this run (Banish-style
    // deckbuilding). Each entry represents one specific rune copy to
    // subtract from the pouch on every rebuild — `createPouch` walks this
    // list and splices one matching (element, rarity, level) rune per
    // entry. Persists across rounds within a run; resets on new run.
    @type([RuneInstance]) banishedRunes = new ArraySchema<RuneInstance>();
}

export class ArkynState extends PluginState {
    @type({ map: ArkynPlayerState })
    players = new MapSchema<ArkynPlayerState>();

    @type(EnemyState) enemy = new EnemyState();
    @type("number") currentRound = 0;
    @type("number") runSeed = 0;
    @type("string") gamePhase = "waiting";
}
