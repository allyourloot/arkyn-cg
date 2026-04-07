import { GameState } from "../shared";
import type { ServerPlugin } from "./ServerPlugin";
import { ServerRuntime } from "./ServerRuntime";

export class ServerBuilder {
    public readonly plugins: ServerPlugin[] = [];

    constructor() {}

    public addPlugin(plugin: ServerPlugin) {
        this.plugins.push(plugin);
    }

    public async build() : Promise<ServerRuntime> {
        const state = new GameState();
        const runtime = new ServerRuntime(state);

        for (const plugin of this.plugins) {
            const pluginState = await plugin.init(runtime);
            state.plugins.set(plugin.id, pluginState);
        }

        return runtime;
    }
}