import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The stand-alone page, built into `../www` - the folder the web adapter serves as `/dreame/`.
 *
 * The same sources as the admin tab (`vite.config.ts`), another entry: `web.html`, which the
 * build writes as `index.html`, so the address the old web interface had, `/dreame/`, opens this.
 * `www` holds nothing but this build and is emptied before each one.
 *
 * Unlike the tab, no socket library is linked in the HTML: the page loads it itself, from the
 * server it was told about, which need not be the one that served it (`src/web/server.ts`).
 */
function asIndexHtml(): Plugin {
	return {
		name: "dreame-web-index",
		enforce: "post",
		generateBundle(_options, bundle) {
			const page = bundle["web.html"];
			if (page) page.fileName = "index.html";
		},
	};
}

export default defineConfig({
	plugins: [react(), asIndexHtml()],
	base: "./",
	resolve: {
		alias: [
			{ find: "@i18n", replacement: fileURLToPath(new URL("./i18n", import.meta.url)) },
			// The package itself only, not its sub-paths: see src/web/guiComponents.ts.
			{
				find: /^@iobroker\/gui-components$/,
				replacement: fileURLToPath(new URL("./src/web/guiComponents.ts", import.meta.url)),
			},
		],
	},
	build: {
		target: "chrome89",
		outDir: fileURLToPath(new URL("../www", import.meta.url)),
		emptyOutDir: true,
		assetsDir: "assets",
		rollupOptions: {
			input: fileURLToPath(new URL("./web.html", import.meta.url)),
		},
	},
});
