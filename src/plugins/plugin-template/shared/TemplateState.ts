import { type } from "@colyseus/schema";
import { PluginState } from "@core/shared";

export class TemplateState extends PluginState {
    @type("string") message = "";
}
