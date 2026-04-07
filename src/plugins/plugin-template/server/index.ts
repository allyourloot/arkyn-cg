import { ServerPlugin } from "@core/server";
import { TemplateState } from "../shared/TemplateState";

export function PluginTemplateServer() : ServerPlugin {
    return new ServerPlugin({
        id: "plugin-template",
        name: "Template",
        version: "0.0.1",
        description: "Template",
        author: "Hytopia",
        dependencies: [],
        init: async () => {
            return new TemplateState();
        }
    });
}