import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { TLS_CERT, TLS_KEY } from "./src/core/shared/SSL";
import path from "path";

// HMR host selection. Desktop dev needs `hmr.host` pinned — with Vite 7
// + HTTPS, omitting it causes the WSS handshake to close without
// opening (reconnect spins forever, no hot updates arrive). Mobile dev
// needs a DIFFERENT hostname (the *.dns-is-boring-we-do-ip-addresses
// wildcard) so the phone's WSS target actually resolves to the laptop
// and not to its own 127.0.0.1. Gate via env var so mobile testing can
// override without editing the config:
//   pnpm client                                 (desktop default)
//   HYTOPIA_DEV_HOST=192-168-1-7.dns-is-... pnpm client   (mobile)
// Both hostnames are on the TLS cert SAN list so the cert passes.
const DEV_HOST = process.env.HYTOPIA_DEV_HOST ?? "local.hytopiahosting.com";

export default defineConfig({
  server: {
    host: true,
    port: 8180,
    strictPort: true,
    https: {
      cert: TLS_CERT,
      key: TLS_KEY,
    },
    hmr: {
      host: DEV_HOST,
      protocol: "wss",
      port: 8180,
      clientPort: 8180,
    },
  },
  plugins: [
    viteSingleFile(),
    tailwindcss(),
    react({
      babel: {
        parserOpts: {
          plugins: ["decorators-legacy"],
        },
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
  ],
  resolve: {
    alias: {
      "@core": path.resolve(__dirname, "src/core"),
      "@plugins": path.resolve(__dirname, "src/plugins"),
    },
  },
});
