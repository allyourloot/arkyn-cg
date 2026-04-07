import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";

// Create dist/assets directory
await mkdir("dist/assets", { recursive: true });

// Copy generated assets
await cp("assets/__generated", "dist/assets/__generated", { recursive: true });

// Copy template
await cp(".hytopia/template", "dist", { recursive: true });

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
