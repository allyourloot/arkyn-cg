import { ArraySchema, type } from "@colyseus/schema";
import { PluginState } from "@core/shared";

export class GradientSkyboxState extends PluginState {
    @type(["string"])
    colors = new ArraySchema<string>();

    @type(["number"])
    positions = new ArraySchema<number>();
}
