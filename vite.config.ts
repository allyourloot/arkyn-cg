import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { TLS_CERT, TLS_KEY } from "./src/core/shared/SSL";
import path from "path";

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
