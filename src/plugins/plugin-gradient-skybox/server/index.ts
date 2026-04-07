import { ServerPlugin } from "@core/server";
import { GradientSkyboxState } from "../shared";

export function PluginGradientSkyboxServer(): ServerPlugin {
    return new ServerPlugin({
        id: "plugin-gradient-skybox",
        name: "Gradient Skybox",
        version: "0.0.1",
        description: "A gradient skybox with configurable color stops",
        author: "Hytopia",
        dependencies: [],
        init: async () => {
            const state = new GradientSkyboxState();
            state.colors.push("#0078fd", "#aceefc", "#aceefc", "#0078fd");
            state.positions.push(0, 20, 50, 100);
            return state;
        },
    });
}
