import { MapSchema, Schema, type } from "@colyseus/schema";
import { PluginState } from "./PluginState";

export class GameState extends Schema {
    @type({ map: PluginState })
    plugins = new MapSchema<PluginState>();
}