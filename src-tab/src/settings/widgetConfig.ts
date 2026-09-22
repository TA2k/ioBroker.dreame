/**
 * The view's settings, per robot: which panels and rows show, map rotation, sidebar side, width
 * and zoom, and - for the stand-alone page - its colours.
 *
 * ## One store with the old web interface
 *
 * Kept where the widget kept them, in `<instance>.<did>.config.widget`, a JSON state the adapter
 * creates for every robot, and in the widget's schema, version 6. So whoever had hidden a panel
 * or turned the map there finds it the same here, and the other way round. The migration from
 * older versions is the widget's (`www/js/core/config.js`), including its quirks: fields it
 * superseded stay where they are, and a config newer than this code is used as it is.
 *
 * ## Shared by link
 *
 * The widget could put its look into a link, `?cfg=`: the difference from the defaults, as
 * base64url JSON. That format is kept too, so links made there open here.
 */

export const WIDGET_CONFIG_VERSION = 6;
const ADAPTER_VERSION = "0.4.0";

/** The panels, by the widget's ids, in its order. `kopf` and `fehler` cannot be hidden. */
export const PANEL_IDS = [
	"kopf",
	"fehler",
	"reinigung",
	"sequence",
	"shortcuts",
	"termine",
	"station",
	"wartung",
	"frischwasser",
	"statistik",
] as const;

export type PanelId = (typeof PANEL_IDS)[number];

/** Panels the user may hide; the header and the fault list are the controls, and always stay. */
export const HIDEABLE_PANELS: readonly PanelId[] = PANEL_IDS.filter(id => id !== "kopf" && id !== "fehler");

/** Panels for robot vacuums only; a mower has no tank, no shortcuts, no schedules, no sequence. */
export const VACUUM_ONLY_PANELS: ReadonlySet<PanelId> = new Set(["sequence", "shortcuts", "termine", "frischwasser"]);

export type ThemeMode = "hell" | "dunkel" | "hauptfarbe" | "custom";

export interface CustomColours {
	hintergrund: string;
	menue: string;
	knoepfe: string;
	rahmen: string;
	schrift: string;
}

export interface WidgetLayout {
	theme: ThemeMode;
	hauptfarbe: string;
	custom: CustomColours;
	/** Map rotation in degrees: 0, 90, 180 or 270. */
	drehung: number;
	leiste: "links" | "rechts";
	/** Sidebar width in pixels. */
	width: number;
	/** UI zoom as a factor, 0.7 to 1.5. */
	groesse: number;
	/** Kept for the widget; not set from here. */
	transparent?: boolean;
	[legacy: string]: unknown;
}

export interface PanelSettings {
	sichtbar: boolean;
	/** Ids of the rows or buttons hidden inside the panel. */
	versteckt: string[];
}

export interface WidgetConfig {
	configVersion: number;
	adapterVersion: string;
	panels: Record<string, PanelSettings>;
	layout: WidgetLayout;
	[other: string]: unknown;
}

export const SIDEBAR_WIDTH = { min: 250, max: 500, step: 10, default: 275 } as const;
export const UI_ZOOM = { min: 0.7, max: 1.5, step: 0.05, default: 1 } as const;
export const ROTATIONS = [0, 90, 180, 270] as const;

const DEFAULT_CUSTOM: CustomColours = {
	hintergrund: "#eef2f8",
	menue: "#ffffff",
	knoepfe: "#f4f7fc",
	rahmen: "#dbe3ef",
	schrift: "#1a2436",
};

export function defaultWidgetConfig(): WidgetConfig {
	const panels: Record<string, PanelSettings> = {};
	for (const id of PANEL_IDS) panels[id] = { sichtbar: true, versteckt: [] };
	return {
		configVersion: WIDGET_CONFIG_VERSION,
		adapterVersion: ADAPTER_VERSION,
		panels,
		layout: {
			farben: "auto",
			hintergrund: "gefuellt",
			leiste: "rechts",
			drehung: 0,
			theme: "dunkel",
			color: "",
			transparent: false,
			width: SIDEBAR_WIDTH.default,
			customBg: "",
			customPanel: "",
			customLine: "",
			customText: "",
			customMuted: "",
			hauptfarbe: "#eef2f8",
			custom: { ...DEFAULT_CUSTOM },
			groesse: UI_ZOOM.default,
		},
	};
}

type Saved = Partial<WidgetConfig> & { aussehen?: Record<string, unknown> };

/** Merges panels field by field, so a panel customised before a field existed gets its default. */
function mergePanels(defaults: WidgetConfig, saved: Saved): Record<string, PanelSettings> {
	const savedPanels = (saved.panels ?? {}) as Record<string, Partial<PanelSettings>>;
	const ids = new Set([...Object.keys(defaults.panels), ...Object.keys(savedPanels)]);
	const panels: Record<string, PanelSettings> = {};
	for (const id of ids) {
		panels[id] = { ...(defaults.panels[id] ?? { sichtbar: true, versteckt: [] }), ...savedPanels[id] } as PanelSettings;
	}
	return panels;
}

/**
 * Brings a stored config up to date, the widget's way.
 *
 * - Newer than this code: used as it is, rather than cut down to what this code knows.
 * - Current: panels merged with the defaults, so panels added since get their entry.
 * - Older: v1's `aussehen` renamed to `layout`, v3's numeric theme mapped to its name, v4's four
 *   custom colours given the fifth, v5's dead `mopp` panel dropped.
 */
export function migrateWidgetConfig(saved: unknown): WidgetConfig {
	const defaults = defaultWidgetConfig();
	if (!saved || typeof saved !== "object" || Array.isArray(saved)) return defaults;
	const stored = saved as Saved;
	const version = typeof stored.configVersion === "number" ? stored.configVersion : 0;

	if (version > WIDGET_CONFIG_VERSION) return stored as WidgetConfig;
	if (version === WIDGET_CONFIG_VERSION) {
		return {
			...(stored as WidgetConfig),
			panels: mergePanels(defaults, stored),
			layout: { ...defaults.layout, ...stored.layout, custom: { ...DEFAULT_CUSTOM, ...stored.layout?.custom } },
		};
	}

	const oldLayout: Record<string, unknown> = { ...(stored.layout ?? stored.aussehen ?? {}) };
	if (typeof oldLayout.theme === "number") {
		const names: Record<number, ThemeMode> = { 0: "hell", 1: "dunkel", 2: "hauptfarbe", 3: "custom" };
		oldLayout.theme = names[oldLayout.theme] ?? "dunkel";
	}
	if (oldLayout.custom && typeof oldLayout.custom === "object") {
		oldLayout.custom = { ...DEFAULT_CUSTOM, ...(oldLayout.custom as Partial<CustomColours>) };
	}

	const withoutMop: Saved = { ...stored };
	if (stored.panels && "mopp" in stored.panels) {
		const panels = { ...stored.panels };
		delete panels.mopp;
		withoutMop.panels = panels;
	}
	const rest: Saved = { ...withoutMop };
	delete rest.aussehen;

	return {
		...defaults,
		...(rest as Partial<WidgetConfig>),
		panels: mergePanels(defaults, withoutMop),
		layout: { ...defaults.layout, ...(oldLayout as Partial<WidgetLayout>) } as WidgetLayout,
		configVersion: WIDGET_CONFIG_VERSION,
		adapterVersion: ADAPTER_VERSION,
	};
}

/** Parses the state value; anything unreadable is the default config. */
export function parseWidgetConfig(value: unknown): WidgetConfig {
	if (typeof value !== "string" || !value) return defaultWidgetConfig();
	try {
		return migrateWidgetConfig(JSON.parse(value));
	} catch {
		return defaultWidgetConfig();
	}
}

// ---- Reading -------------------------------------------------------------------------------

export function panelVisible(config: WidgetConfig, id: PanelId, robotType?: string | null): boolean {
	if (robotType === "mower" && VACUUM_ONLY_PANELS.has(id)) return false;
	return config.panels[id]?.sichtbar !== false;
}

export function hiddenFields(config: WidgetConfig, id: PanelId): ReadonlySet<string> {
	return new Set(config.panels[id]?.versteckt ?? []);
}

export function clampSidebarWidth(px: number): number {
	return Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, Math.round(px) || SIDEBAR_WIDTH.min));
}

/** Clamps a zoom factor to the widget's 70 to 150 per cent, in whole per cent. */
export function clampZoom(factor: number): number {
	const percent = Math.min(150, Math.max(70, Math.round(factor * 100) || 100));
	return percent / 100;
}

export function normaliseRotation(value: unknown): 0 | 90 | 180 | 270 {
	const n = Number(value);
	return n === 90 || n === 180 || n === 270 ? n : 0;
}

// ---- Changing - each returns a new config ---------------------------------------------------

export function withPanelVisible(config: WidgetConfig, id: PanelId, visible: boolean): WidgetConfig {
	const current = config.panels[id] ?? { sichtbar: true, versteckt: [] };
	return { ...config, panels: { ...config.panels, [id]: { ...current, sichtbar: visible } } };
}

export function withFieldHidden(config: WidgetConfig, id: PanelId, field: string, hidden: boolean): WidgetConfig {
	const current = config.panels[id] ?? { sichtbar: true, versteckt: [] };
	const fields = new Set(Array.isArray(current.versteckt) ? current.versteckt : []);
	if (hidden) fields.add(field);
	else fields.delete(field);
	return { ...config, panels: { ...config.panels, [id]: { ...current, versteckt: [...fields] } } };
}

export function withLayout(config: WidgetConfig, change: Partial<WidgetLayout>): WidgetConfig {
	return {
		...config,
		layout: {
			...config.layout,
			...change,
			custom: { ...config.layout.custom, ...(change.custom ?? {}) },
		},
	};
}

// ---- Links ----------------------------------------------------------------------------------

/** The layout fields a link carries: the ones the settings let the user change. */
const LINK_LAYOUT_FIELDS = ["theme", "hauptfarbe", "drehung", "leiste", "groesse", "width"] as const;
const LINK_COLOURS = ["hintergrund", "menue", "knoepfe", "rahmen", "schrift"] as const;

export interface ConfigDelta {
	layout?: Partial<Omit<WidgetLayout, "custom">> & { custom?: Partial<CustomColours> };
	panels?: Record<string, { sichtbar: boolean }>;
}

function sameValue(field: string, a: unknown, b: unknown): boolean {
	// The zoom is a float that picks up rounding noise on its way through per cent.
	if (field === "groesse") return Math.round((Number(a) || 0) * 100) === Math.round((Number(b) || 0) * 100);
	if (typeof a === "string" && typeof b === "string") return a.toLowerCase() === b.toLowerCase();
	return a === b;
}

/** What differs from the defaults: the look and which panels show. Not the robot, on purpose. */
export function configDelta(config: WidgetConfig): ConfigDelta {
	const defaults = defaultWidgetConfig();
	const delta: ConfigDelta = {};
	for (const field of LINK_LAYOUT_FIELDS) {
		if (!sameValue(field, config.layout[field], defaults.layout[field])) {
			delta.layout = { ...delta.layout, [field]: config.layout[field] };
		}
	}
	for (const colour of LINK_COLOURS) {
		if (!sameValue(colour, config.layout.custom[colour], defaults.layout.custom[colour])) {
			delta.layout = { ...delta.layout, custom: { ...delta.layout?.custom, [colour]: config.layout.custom[colour] } };
		}
	}
	for (const id of PANEL_IDS) {
		const visible = config.panels[id]?.sichtbar !== false;
		if (!visible) delta.panels = { ...delta.panels, [id]: { sichtbar: false } };
	}
	return delta;
}

/** Applies a link's delta, field by field, so one changed colour leaves the other four alone. */
export function applyDelta(config: WidgetConfig, delta: ConfigDelta): WidgetConfig {
	let next = config;
	if (delta.layout) {
		const { custom, ...rest } = delta.layout;
		next = withLayout(next, { ...(rest as Partial<WidgetLayout>), custom: { ...next.layout.custom, ...custom } });
	}
	for (const [id, panel] of Object.entries(delta.panels ?? {})) {
		const current = next.panels[id] ?? { sichtbar: true, versteckt: [] };
		next = { ...next, panels: { ...next.panels, [id]: { ...current, ...panel } } };
	}
	return next;
}

/** Base64url of UTF-8 text, the widget's encoding for `?cfg=`. */
export function encodeBase64Url(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeBase64Url(blob: string): string {
	const base64 = blob.replace(/-/g, "+").replace(/_/g, "/");
	const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
	const binary = atob(padded);
	return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}

/** Reads a `?cfg=` value; null for anything that is not a delta. */
export function parseDelta(blob: string | null): ConfigDelta | null {
	if (!blob) return null;
	try {
		const delta: unknown = JSON.parse(decodeBase64Url(blob));
		return delta && typeof delta === "object" && !Array.isArray(delta) ? (delta as ConfigDelta) : null;
	} catch {
		return null;
	}
}
