import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";
import { PluginState } from "@core/shared";

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
}

export class ArkynState extends PluginState {
    @type({ map: ArkynPlayerState })
    players = new MapSchema<ArkynPlayerState>();

    @type(EnemyState) enemy = new EnemyState();
    @type("number") currentRound = 0;
    @type("string") gamePhase = "waiting";
}
