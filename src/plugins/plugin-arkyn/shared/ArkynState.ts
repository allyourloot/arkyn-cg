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
}

export class ArkynPlayerState extends Schema {
    @type([RuneInstance]) hand = new ArraySchema<RuneInstance>();
    @type([RuneInstance]) playedRunes = new ArraySchema<RuneInstance>();
    @type("number") pouchSize = 0;
    @type("string") lastSpellName = "";
    @type("number") lastSpellTier = 0;
    @type("number") lastDamage = 0;
    @type("number") castsRemaining = 3;
    @type("number") discardsRemaining = 3;
}

export class ArkynState extends PluginState {
    @type({ map: ArkynPlayerState })
    players = new MapSchema<ArkynPlayerState>();

    @type(EnemyState) enemy = new EnemyState();
    @type("number") currentRound = 0;
    @type("string") gamePhase = "waiting";
}
