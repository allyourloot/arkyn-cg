import { ClientBuilder } from "@core/client/ClientBuilder";
import { AuthPluginClient } from "@plugins/plugin-auth/client";
import { PluginThreeJSRendererClient } from "@plugins/plugin-threejs-renderer/client";
import { PluginArkynClient } from "@plugins/plugin-arkyn/client";

async function main() {
    const builder = new ClientBuilder();
    builder.addPlugin(AuthPluginClient());
    builder.addPlugin(PluginThreeJSRendererClient());
    builder.addPlugin(PluginArkynClient());

    const runtime = await builder.build();
    runtime.start();
}

main();
