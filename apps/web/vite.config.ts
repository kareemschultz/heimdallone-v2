import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
	server: {
		port: 3001,
		proxy: {
			"/api": {
				target: "http://localhost:3000",
				changeOrigin: true,
			},
			"/rpc": {
				target: "http://localhost:3000",
				changeOrigin: true,
			},
		},
	},
	resolve: {
		tsconfigPaths: true,
		// Dedupe React/router so the SSR bundle keeps single instances — avoids
		// "Route.update is undefined" from duplicated singletons in the Nitro build.
		dedupe: ["react", "react-dom", "@tanstack/react-router"],
	},
	plugins: [
		tailwindcss(),
		tanstackStart(),
		// Official order (TanStack Start + Bun docs): nitro() comes right after
		// tanstackStart() and BEFORE viteReact(). Wrong order leaves route exports
		// unbound in the SSR bundle → "Route.update is undefined". Bun preset
		// (container runtime is Bun); overridable via NITRO_PRESET (e.g. vercel).
		nitro({ preset: process.env.NITRO_PRESET ?? "bun" }),
		viteReact(),
	],
});
