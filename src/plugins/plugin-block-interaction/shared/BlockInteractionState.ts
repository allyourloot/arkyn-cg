import { type } from "@colyseus/schema";
import { PluginState } from "@core/shared";

export class BlockInteractionState extends PluginState {
    @type("boolean") __registered = true;
}
