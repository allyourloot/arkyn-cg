import { type } from "@colyseus/schema";
import { PluginState } from "@core/shared";

export class BlockOverlayState extends PluginState {
    @type("boolean") __registered = true;
}
