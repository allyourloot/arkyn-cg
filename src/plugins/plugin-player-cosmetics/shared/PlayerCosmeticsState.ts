import { MapSchema, Schema, type } from "@colyseus/schema";
import { PluginState } from "@core/shared";

export class PlayerCosmeticsEntry extends Schema {
    @type("string") userId = "";
    @type("string") loadoutJson = "";
    @type("string") hairModelUrl = "";
    @type("string") hairTextureUrl = "";
    @type("string") skinTextureUrl = "";
}

export class PlayerCosmeticsState extends PluginState {
    @type({ map: PlayerCosmeticsEntry })
    players = new MapSchema<PlayerCosmeticsEntry>();
}
