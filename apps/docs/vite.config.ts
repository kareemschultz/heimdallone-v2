import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [
    mdx(),
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
      },
    }),
    react(),
    // Hosting preset is overridable so the same app can target Vercel (default)
    // or a self-hosted Node/Bun container (NITRO_PRESET=node-server → .output/).
    // https://tanstack.com/start/latest/docs/framework/react/guide/hosting#nitro
    nitro({
      preset: process.env.NITRO_PRESET ?? "vercel",
    }),
  ],
  resolve: {
    tsconfigPaths: true,
    alias: {
      tslib: "tslib/tslib.es6.js",
    },
  },
});
