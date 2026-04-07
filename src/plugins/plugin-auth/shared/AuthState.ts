import { MapSchema, Schema, type } from "@colyseus/schema";
import { PluginState } from "@core/shared";

export class AuthEntry extends Schema {
    @type("string") userId = "";
    @type("string") username = "";
}

export class AuthState extends PluginState {
    @type({ map: AuthEntry })
    players = new MapSchema<AuthEntry>();
}
