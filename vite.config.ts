import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { TLS_CERT, TLS_KEY } from "./src/core/shared/SSL";
import path from "path";

export default defineConfig({
  server: {
    host: true,
    port: 8180,
    strictPort: true,
    https: {
      cert: TLS_CERT,
      key: TLS_KEY,
    },
    // HMR host is intentionally NOT pinned — Vite's HMR client falls back
    // to the page's current hostname when omitted. Desktop hits
    // local.hytopiahosting.com:8180 and gets HMR at wss://local.hytopiahosting.com:8180;
    // mobile hits the 192-168-1-7.dns-is-boring-we-do-ip-addresses.hytopiahosting.com
    // wildcard and gets HMR at the matching wss host. Both hostnames are
    // on the cert's SAN list, so TLS passes either way. Previously this
    // was pinned to local.hytopiahosting.com, which broke mobile because
    // that host resolves to 127.0.0.1 on the phone — HMR WSS failed and
    // Vite's reconnect loop triggered an infinite page reload.
    hmr: {
      protocol: "wss",
      port: 8180,
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
