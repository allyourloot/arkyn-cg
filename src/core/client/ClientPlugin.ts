import type { PluginState } from "../shared";
import type { ClientRuntime } from "./ClientRuntime";

export type ClientPluginInit = (runtime: ClientRuntime, state: PluginState) => Promise<void>;
export type ClientPluginCreationArgs = {
    id: string,
    name: string,
    version: string,
    description: string,
    author: string,
    dependencies: string[],
    clientOnly?: boolean,

    init: ClientPluginInit,
}

export class ClientPlugin {
    public readonly id: string;
    public readonly name: string;
    public readonly version: string;
    public readonly description: string;
    public readonly author: string;
    public readonly dependencies: string[];
    public readonly clientOnly: boolean;

    public readonly init: ClientPluginInit;

    constructor({ id, name, version, description, author, dependencies, clientOnly, init }: ClientPluginCreationArgs) {
        this.id = id;
        this.name = name;
        this.version = version;
        this.description = description;
        this.author = author;
        this.dependencies = dependencies;
        this.clientOnly = clientOnly ?? false;

        this.init = init;
    }
}