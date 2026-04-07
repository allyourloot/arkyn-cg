import { MapSchema, Schema, type } from "@colyseus/schema";
import { PluginState } from "@core/shared";

export class PlayerPositionState extends Schema {
    @type("number") x = 0;
    @type("number") y = 0;
    @type("number") z = 0;
    @type("number") yaw = 0;
    @type("number") pitch = 0;
}

export class PlayerRendererState extends PluginState {
    @type({ map: PlayerPositionState })
    players = new MapSchema<PlayerPositionState>();
}
