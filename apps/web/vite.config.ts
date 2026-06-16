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
		viteReact(),
		// Self-hostable SSR output. Default to the Bun preset (the container
		// runtime is Bun); inlines deps into .output/ so no node_modules at
		// runtime. Overridable (e.g. NITRO_PRESET=vercel) without editing this file.
		nitro({ preset: process.env.NITRO_PRESET ?? "bun" }),
	],
});
