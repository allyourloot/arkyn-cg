import { ClientBuilder } from "@core/client/ClientBuilder";
import { AuthPluginClient } from "@plugins/plugin-auth/client";
import { PluginThreeJSRendererClient } from "@plugins/plugin-threejs-renderer/client";
import { PluginArkynClient } from "@plugins/plugin-arkyn/client";
import appIconUrl from "/assets/logos/arkyn-app.png?url";

// iOS "Add to Home Screen" looks up <link rel="apple-touch-icon"> when the
// user adds the page; without it the icon falls back to a screenshot/black
// "C". The href is injected at runtime so the import survives the
// vite-plugin-singlefile production build (resolves to an inlined data URL
// in prod, a real /assets/... URL in dev).
{
    const link = document.createElement("link");
    link.rel = "apple-touch-icon";
    link.href = appIconUrl;
    document.head.appendChild(link);
}

async function main() {
    const builder = new ClientBuilder();
    builder.addPlugin(AuthPluginClient());
    builder.addPlugin(PluginThreeJSRendererClient());
    builder.addPlugin(PluginArkynClient());

    const runtime = await builder.build();
    runtime.start();
}

main();
