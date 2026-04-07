import { ClientPlugin } from "@core/client";

export function PluginWelcomeScreenClient() : ClientPlugin {
    return new ClientPlugin({
        id: "plugin-welcome-screen",
        name: "Welcome Screen",
        version: "0.0.1",
        description: "Welcome Screen",
        author: "Hytopia",
        dependencies: [],
        init: async (runtime) => {
            runtime.addOverlay(<div>Welcome Screen</div>);
        }
    });
}