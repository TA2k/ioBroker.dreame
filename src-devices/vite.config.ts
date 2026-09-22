import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import commonjs from "vite-plugin-commonjs";
import { federation } from "@module-federation/vite";
import { hostShared } from "./hostShared";

/**
 * The devices app's tile for a Dreame robot.
 *
 * ## The views are not in this project
 *
 * Map, 3D, panels and tiles live in `../src-tab/src` and are shared with the admin tab and the
 * vis-2 widget set, reached here through the `@dreame` alias. This project adds only what is
 * particular to the devices app: the `WidgetGeneric` subclass and its settings.
 *
 * ## No Module Federation sharing - on purpose
 *
 * `shared` is empty because the devices app shares nothing through federation; it hands its React,
 * MUI and gui-components out on `window.__iobrokerShared__` instead. Declaring them shared here
 * would make the runtime find nothing in the share scope and fall back to a copy bundled into this
 * tile - a second React, on which every hook fails. {@link hostShared} redirects the imports to that
 * global; see there.
 */
const dir = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

const config = {
	plugins: [
		hostShared([
			dir("./src"),
			dir("../src-tab/src"),
			// The stub of the devices base class imports `Component` from react.
			dir("./node_modules/@iobroker/dm-widgets/build"),
		]),
		federation({
			manifest: true,
			name: "DevicesWidgetDreameSet",
			filename: "customDevices.js",
			exposes: {
				"./Components": "./src/Components.tsx",
				// Loaded by json-config, not by the devices app itself: the robot and floor fields of the
				// tile's settings.
				"./ConfigComponents": "./src/config/ConfigComponents.tsx",
				"./translations": "./src/translations",
			},
			remotes: {},
			shared: {},
			dts: false,
		}),
		react(),
		commonjs(),
	],
	resolve: {
		alias: {
			"@dreame": dir("../src-tab/src"),
			"@i18n": dir("../src-tab/i18n"),
		},
		// three is the one large library still bundled here; resolved from this project so the shared
		// views in `../src-tab/src` do not pull in the tab's copy as well.
		dedupe: ["three"],
	},
	server: {
		fs: {
			// The shared views and translations live outside this project root.
			allow: [dir("..")],
		},
	},
	base: "./",
	build: {
		// Top-level await, emitted by the federation plugin, needs chrome89+.
		target: "chrome89",
		outDir: "./build",
		rollupOptions: {
			onwarn(warning: { code: string }, warn: (warning: { code: string }) => void): void {
				// "Module level directives cause errors when bundled" - harmless for "use client".
				if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
				warn(warning);
			},
		},
	},
};

export default config;
