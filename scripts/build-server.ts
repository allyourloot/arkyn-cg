import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";

// Create dist/assets directory
await mkdir("dist/assets", { recursive: true });

// Empty mountpoints expected by the HYTOPIA deploy runtime (bind-mounts
// .app-writable/assets/<path> over /app/assets/<path>; missing dirs fail OCI init).
const HYTOPIA_DEPLOY_MOUNTPOINTS = [
    "models",
    "blocks/.atlas",
];
for (const path of HYTOPIA_DEPLOY_MOUNTPOINTS) {
    await mkdir(`dist/assets/${path}`, { recursive: true });
    await writeFile(`dist/assets/${path}/.gitkeep`, "");
}

// Build server
await build({
    entryPoints: ["src/server.ts"],
    outfile: "dist/index.mjs",
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    mainFields: ["module", "main"],
    banner: {
        js: `
import * as __nodeModule from "node:module";
import { fileURLToPath as __fileURLToPath } from "node:url";
import * as __nodePath from "node:path";

const __esm_filename = __fileURLToPath(import.meta.url);
const __esm_dirname = __nodePath.dirname(__esm_filename);
const require = __nodeModule.createRequire(import.meta.url);
        `.trim(),
    },
    define: {
        "import.meta.filename": "__esm_filename",
        "import.meta.dirname": "__esm_dirname",
    },
    tsconfig: "tsconfig.server.json",
});

await writeFile(
    "dist/package.json",
    JSON.stringify(
        {
            name: "arkyn",
            version: "1.0.0",
            type: "module",
            main: "index.mjs",
            scripts: { start: "node index.mjs" },
        },
        null,
        2,
    ),
);
