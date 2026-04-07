import { type } from "@colyseus/schema";
import { PluginState } from "@core/shared";

export class IngamePurchasesState extends PluginState {
    @type("boolean") __registered = true;
}
