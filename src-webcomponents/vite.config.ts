import react from "@vitejs/plugin-react";
import { checkManifest, getReactImportPath, REACT_SPECIFIERS } from "@iobroker/web-components";
import { readdirSync, readFileSync } from "node:fs";
import type { Plugin, UserConfig } from "vite";

// with the extension: Vite may load its config natively, without a bundler that would add it
import { FURNITURE_DIR, MANIFEST_FILE, MODULE_FILE, MODULE_PATH, TAG } from "./src/constants.ts";
import { robotManifest } from "./src/manifest.ts";

/**
 * The web component `<iob-dreame-robot>`: one ES module, `admin/webcomponents/dreame-robot.js`, its manifest
 * `dreame-robot.json` next to it (`common.webComponents`), and the furniture pictures of the map in
 * `furniture/`. Every host - vis-2, devices, Aura, admin - reads them from `/adapter/dreame/webcomponents/`. No module
 * federation: the host shares nothing but the socket.
 *
 * The map is decoded and drawn by the pure modules of the views in `../src-tab/src` (map, floors, status codes,
 * device list), imported by relative path and compiled in; nothing of MUI or gui-components comes along.
 *
 * React is not bundled: the four React imports point at `lib/esm/react-19.js`, which web and admin serve beside
 * `adapter/`. The path is relative to the module, so a path prefix of a reverse proxy stays.
 */

const LANGUAGES = ["en", "de", "ru", "pt", "nl", "fr", "it", "es", "pl", "uk", "zh-cn"];

/** The words of the native views the element shows (`words.view()` in `src/i18n.ts`): these keys and prefixes */
const WORD_KEYS = [
	"panel.kopf.start-knopf",
	"panel.kopf.trocknung-praefix",
	"room.fallback",
	"tab.commandFailed",
	"tab.dock",
	"tab.floor.gespeichert",
	"tab.floor.keinBild",
	"tab.info.akku",
	"tab.info.flaeche",
	"tab.info.reinigung",
	"tab.mapError",
	"tab.noMap",
	"tab.stop",
];
const WORD_PREFIXES = ["panel.kopf.status.", "room.type."];

/** The dictionaries of the views are ~25 kB per language; the element needs ~5 kB of them */
function pickWords(): Record<string, Record<string, string>> {
	const picked: Record<string, Record<string, string>> = {};
	for (const lang of LANGUAGES) {
		const dictionary = JSON.parse(
			readFileSync(new URL(`../src-tab/i18n/${lang}.json`, import.meta.url), "utf8"),
		) as Record<string, string>;
		picked[lang] = {};
		for (const [key, text] of Object.entries(dictionary)) {
			if (WORD_KEYS.includes(key) || WORD_PREFIXES.some(prefix => key.startsWith(prefix))) {
				picked[lang][key] = text;
			}
		}
	}
	const missing = WORD_KEYS.filter(key => !picked.en[key]);
	if (missing.length) {
		throw new Error(`src-tab/i18n/en.json has no text for ${missing.join(", ")}`);
	}
	return picked;
}

/** The furniture pictures of the views, `<type>.png` */
const FURNITURE_URL = new URL("../src-tab/src/map/furniture/", import.meta.url);
const FURNITURE_FILES = readdirSync(FURNITURE_URL).filter(name => /^\d+\.png$/.test(name));

/**
 * Writes `dreame-robot.json` next to the module, checked like a host checks it, and the furniture pictures into
 * `furniture/`: files rather than data URLs in the module, so that a browser loads only the pictures of the furniture
 * a map has (some 350 kB all together)
 */
function webComponentFiles(): Plugin {
	return {
		name: "dreame-web-component-files",
		generateBundle() {
			const problem = checkManifest(robotManifest);
			if (problem) {
				this.error(`${MANIFEST_FILE}: ${problem}`);
			}
			if (robotManifest.module !== MODULE_FILE || robotManifest.tag !== TAG) {
				this.error(`${MANIFEST_FILE}: "module" must be "${MODULE_FILE}" and "tag" "${TAG}"`);
			}
			this.emitFile({
				type: "asset",
				fileName: MANIFEST_FILE,
				source: `${JSON.stringify(robotManifest, null, 4)}\n`,
			});
			for (const name of FURNITURE_FILES) {
				this.emitFile({
					type: "asset",
					fileName: `${FURNITURE_DIR}/${name}`,
					source: readFileSync(new URL(name, FURNITURE_URL)),
				});
			}
		},
	};
}

const reactImport = getReactImportPath(MODULE_PATH);

const config: UserConfig = {
	plugins: [react(), webComponentFiles()],
	define: {
		__DREAME_WORDS__: JSON.stringify(pickWords()),
		__DREAME_FURNITURE__: JSON.stringify(FURNITURE_FILES.map(name => Number.parseInt(name, 10)).sort((a, b) => a - b)),
		"process.env.NODE_ENV": JSON.stringify("production"),
	},
	build: {
		target: "es2022",
		outDir: "./build",
		emptyOutDir: true,
		lib: {
			entry: "./src/index.tsx",
			formats: ["es"],
			fileName: (): string => MODULE_FILE,
		},
		rollupOptions: {
			external: [...REACT_SPECIFIERS],
			output: {
				paths: Object.fromEntries(REACT_SPECIFIERS.map(specifier => [specifier, reactImport])),
				// one file: a host imports exactly one URL
				codeSplitting: false,
				// library mode keeps whitespace for the bundler of a consumer; this module is loaded as it is
				minify: true,
			},
		},
	},
};

export default config;
