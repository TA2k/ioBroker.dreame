import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { federation } from "@module-federation/vite";
import { moduleFederationShared } from "@iobroker/types-vis-2/modulefederation.vis.config";
import pack from "./package.json";

/**
 * vis-2's widget set for a Dreame robot.
 *
 * ## The views are not in this project
 *
 * Map, 3D, panels and tiles live in `../src-tab/src`, shared with the admin tab and the devices
 * tile through the `@dreame` alias. This project adds only the `VisRxWidget` subclass.
 *
 * ## Sharing works differently from the devices app
 *
 * vis-2 does share React and MUI through Module Federation, as singletons in its share scope, so
 * plain imports are right here - unlike the devices tile, which has to read them off a global.
 * `dedupe` still matters: a file in `../src-tab/src` would otherwise resolve `react` next to itself,
 * from the tab's `node_modules`, and the federation runtime would see two different packages.
 *
 * gui-components is not shared by vis-2 at all; only its `I18n` is bundled - see
 * `./src/guiComponents.ts`.
 */
const dir = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

const config = {
	plugins: [
		federation({
			manifest: true,
			name: "vis2DreameWidgets",
			filename: "customWidgets.js",
			exposes: {
				"./DreameRobot": "./src/DreameRobot.tsx",
				"./translations": "./src/translations",
			},
			remotes: {},
			shared: moduleFederationShared(pack),
			dts: false,
		}),
		react(),
	],
	resolve: {
		alias: [
			{ find: "@dreame", replacement: dir("../src-tab/src") },
			{ find: "@i18n", replacement: dir("../src-tab/i18n") },
			// The package itself only, not its sub-paths: `./src/guiComponents.ts` reaches `I18n` by one.
			{ find: /^@iobroker\/gui-components$/, replacement: dir("./src/guiComponents.ts") },
			// The icon package reaches for this deep path, which the share scope does not cover, and
			// pulled a second MUI into the bundle with it - see `./src/muiSvgIcon.tsx`.
			{ find: /^@mui\/material\/SvgIcon$/, replacement: dir("./src/muiSvgIcon.tsx") },
		],
		dedupe: [
			"react",
			"react-dom",
			"@emotion/react",
			"@emotion/styled",
			"@mui/material",
			"@mui/system",
			"@mui/icons-material",
			"@iobroker/gui-components",
			"three",
		],
	},
	server: {
		fs: {
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
				if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
				warn(warning);
			},
		},
	},
};

export default config;
