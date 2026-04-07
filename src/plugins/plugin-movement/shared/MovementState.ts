import { MapSchema, Schema, type } from "@colyseus/schema";
import { PluginState } from "@core/shared";

export const MOVEMENT_UPDATE_POSITION_MESSAGE = "movement:update-position";

export class MovementPlayerState extends Schema {
    @type("number") x = 0;
    @type("number") y = 0;
    @type("number") z = 0;
    @type("number") yaw = 0;
    @type("number") pitch = 0;
}

export class MovementState extends PluginState {
    @type("boolean") public __registered = true;

    @type({ map: MovementPlayerState })
    public players = new MapSchema<MovementPlayerState>();
}
