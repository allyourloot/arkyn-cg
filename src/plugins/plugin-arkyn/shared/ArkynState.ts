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
    @type([RuneInstance]) playedRunes = new ArraySchema<RuneInstance>();
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

    // Consumable items — up to MAX_CONSUMABLES (2). Each entry is an
    // element name representing a scroll consumable (e.g. "fire").
    // Players click USE to apply the scroll (increments scrollLevels).
    @type(["string"]) consumables = new ArraySchema<string>();

    // Current shop inventory — populated on entering the shop phase and
    // synced to the client for rendering. Each entry tracks whether the
    // item has been purchased so the client can grey it out.
    @type([ShopItemState]) shopItems = new ArraySchema<ShopItemState>();
}

export class ArkynState extends PluginState {
    @type({ map: ArkynPlayerState })
    players = new MapSchema<ArkynPlayerState>();

    @type(EnemyState) enemy = new EnemyState();
    @type("number") currentRound = 0;
    @type("number") runSeed = 0;
    @type("string") gamePhase = "waiting";
}
