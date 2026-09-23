import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Pulls socket.io in from the admin rather than from the web adapter.
 *
 * The tab runs inside the admin, which serves its own client at `admin/lib/js/socket.io.js`.
 * The tag cannot sit in `tab.html` itself: that file does not exist at build time, so Vite
 * would try to resolve and bundle it and fail. Injecting it after the HTML transform leaves
 * the URL untouched for the browser to fetch at runtime.
 *
 * The `onerror` reload is the admin's own convention - a tab opened while the admin is still
 * starting would otherwise sit there with no socket and no way to recover.
 */
function adminSocketIo(): Plugin {
	return {
		name: "dreame-admin-socket-io",
		transformIndexHtml: {
			order: "post",
			handler(html: string): string {
				return html.replace(
					"</head>",
					`    <script type="text/javascript" onerror="setTimeout(function(){window.location.reload()}, 5000)" src="./../../lib/js/socket.io.js"></script>\n</head>`,
				);
			},
		},
	};
}

export default defineConfig({
	plugins: [react(), adminSocketIo()],
	// The admin serves this from `adapter/dreame/tab.html`, so every asset URL has to be relative.
	base: "./",
	resolve: {
		alias: {
			// The 11 translation files the existing widget already ships are reused as they are,
			// rather than copied into a second store that would drift from the first.
			"@i18n": fileURLToPath(new URL("./i18n", import.meta.url)),
		},
	},
	server: {
		port: 3000,
		fs: {
			// The shared translation files live outside this project root.
			allow: [fileURLToPath(new URL("..", import.meta.url))],
		},
	},
	build: {
		target: "chrome89",
		outDir: fileURLToPath(new URL("../admin", import.meta.url)),
		// admin/ holds hand-maintained files (jsonConfig.json, dreame.png) that must survive a build.
		emptyOutDir: false,
		assetsDir: "assets",
		rollupOptions: {
			input: fileURLToPath(new URL("./tab.html", import.meta.url)),
		},
	},
});
