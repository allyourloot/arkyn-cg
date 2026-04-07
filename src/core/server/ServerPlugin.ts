import { PluginState } from "../shared/PluginState";
import { ServerRuntime } from "./ServerRuntime";

export type ServerPluginCreationArgs = {
    id: string,
    name: string,
    version: string,
    description: string,
    author: string,
    dependencies: string[],
    init: (runtime: ServerRuntime) => Promise<PluginState>;
}

export class ServerPlugin {
    public readonly id: string;
    public readonly name: string;
    public readonly version: string;
    public readonly description: string;
    public readonly author: string;
    public readonly dependencies: string[];
    public readonly init: (runtime: ServerRuntime) => Promise<PluginState>;

    constructor({ id, name, version, description, author, dependencies, init }: ServerPluginCreationArgs) {
        this.id = id;
        this.name = name;
        this.version = version;
        this.description = description;
        this.author = author;
        this.dependencies = dependencies;

        this.init = init;
    }
}