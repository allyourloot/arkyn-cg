import { type } from "@colyseus/schema";
import { PluginState } from "@core/shared";

export class ThreeJSRendererState extends PluginState {
    @type("boolean") __registered = true;
}
