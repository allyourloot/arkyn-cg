import { ServerBuilder } from "@core/server";
import { AuthPluginServer } from "@plugins/plugin-auth/server";
import { PluginArkynServer } from "@plugins/plugin-arkyn/server";
import { PluginQRCodeServer } from "@plugins/plugin-qr-code/server";

const port = process.env.PORT ? parseInt(process.env.PORT) : 8181;
async function main() {
    const core = new ServerBuilder();
    core.addPlugin(AuthPluginServer());
    core.addPlugin(PluginArkynServer());
    core.addPlugin(PluginQRCodeServer());

    const runtime = await core.build();
    await runtime.start(port);
}

main();
