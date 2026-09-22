import { describe, expect, it } from "vitest";
import {
	WIDGET_CONFIG_VERSION,
	applyDelta,
	clampSidebarWidth,
	clampZoom,
	configDelta,
	decodeBase64Url,
	defaultWidgetConfig,
	encodeBase64Url,
	hiddenFields,
	migrateWidgetConfig,
	normaliseRotation,
	panelVisible,
	parseDelta,
	parseWidgetConfig,
	withFieldHidden,
	withLayout,
	withPanelVisible,
} from "./widgetConfig";
import { mixHex, widgetPalette } from "./theme";

describe("migrateWidgetConfig", () => {
	it("starts from the defaults where nothing usable is stored", () => {
		expect(parseWidgetConfig(null)).toEqual(defaultWidgetConfig());
		expect(parseWidgetConfig("not json")).toEqual(defaultWidgetConfig());
	});

	it("keeps a current config and gives panels added since their entry", () => {
		const stored = defaultWidgetConfig();
		delete (stored.panels as Record<string, unknown>).termine;
		stored.panels.wartung = { sichtbar: false, versteckt: ["filter-left"] };
		const migrated = migrateWidgetConfig(stored);
		expect(migrated.panels.termine).toEqual({ sichtbar: true, versteckt: [] });
		expect(migrated.panels.wartung).toEqual({ sichtbar: false, versteckt: ["filter-left"] });
	});

	it("uses a config newer than this code as it is", () => {
		const newer = { configVersion: WIDGET_CONFIG_VERSION + 1, whatever: 1 };
		expect(migrateWidgetConfig(newer)).toBe(newer);
	});

	it("migrates the widget's old versions: aussehen, numeric theme, four colours, the mop panel", () => {
		const old = {
			configVersion: 3,
			aussehen: { theme: 2, drehung: 90, custom: { hintergrund: "#000000" } },
			panels: { mopp: { sichtbar: true }, reinigung: { sichtbar: false } },
		};
		const migrated = migrateWidgetConfig(old);
		expect(migrated.configVersion).toBe(WIDGET_CONFIG_VERSION);
		expect(migrated.layout.theme).toBe("hauptfarbe");
		expect(migrated.layout.drehung).toBe(90);
		expect(migrated.layout.custom).toMatchObject({ hintergrund: "#000000", knoepfe: "#f4f7fc" });
		expect(migrated.panels.mopp).toBeUndefined();
		expect(migrated.panels.reinigung).toEqual({ sichtbar: false, versteckt: [] });
		expect("aussehen" in migrated).toBe(false);
	});
});

describe("reading and changing", () => {
	it("hides panels and rows, and the vacuum-only panels on a mower", () => {
		let config = withPanelVisible(defaultWidgetConfig(), "statistik", false);
		config = withFieldHidden(config, "station", "dry", true);
		expect(panelVisible(config, "statistik")).toBe(false);
		expect(panelVisible(config, "shortcuts", "mower")).toBe(false);
		expect(panelVisible(config, "wartung", "mower")).toBe(true);
		expect([...hiddenFields(config, "station")]).toEqual(["dry"]);
		expect([...hiddenFields(withFieldHidden(config, "station", "dry", false), "station")]).toEqual([]);
	});

	it("changes one colour without losing the others", () => {
		const config = withLayout(defaultWidgetConfig(), { custom: { schrift: "#ffffff" } as never });
		expect(config.layout.custom).toMatchObject({ schrift: "#ffffff", menue: "#ffffff", hintergrund: "#eef2f8" });
	});

	it("keeps width, zoom and rotation inside the widget's bounds", () => {
		expect(clampSidebarWidth(9999)).toBe(500);
		expect(clampSidebarWidth(Number.NaN)).toBe(250);
		expect(clampZoom(2)).toBe(1.5);
		expect(clampZoom(1.0000000002)).toBe(1);
		expect(normaliseRotation("180")).toBe(180);
		expect(normaliseRotation(45)).toBe(0);
	});
});

describe("links", () => {
	it("round-trips UTF-8 through base64url without padding or unsafe characters", () => {
		const text = JSON.stringify({ name: "Küche ⚙" });
		const encoded = encodeBase64Url(text);
		expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(decodeBase64Url(encoded)).toBe(text);
	});

	it("carries only what differs from the defaults, and applies it field by field", () => {
		let config = withLayout(defaultWidgetConfig(), { drehung: 270, groesse: 1.2 });
		config = withLayout(config, { custom: { rahmen: "#123456" } as never });
		config = withPanelVisible(config, "termine", false);
		const delta = configDelta(config);
		expect(delta).toEqual({
			layout: { drehung: 270, groesse: 1.2, custom: { rahmen: "#123456" } },
			panels: { termine: { sichtbar: false } },
		});

		const applied = applyDelta(defaultWidgetConfig(), parseDelta(encodeBase64Url(JSON.stringify(delta)))!);
		expect(applied.layout.drehung).toBe(270);
		expect(applied.layout.custom).toMatchObject({ rahmen: "#123456", schrift: "#1a2436" });
		expect(applied.panels.termine?.sichtbar).toBe(false);
	});

	it("opens a link the widget made", () => {
		// Built the widget's way: encodeURIComponent, then bytes, then btoa, then base64url.
		const json = JSON.stringify({ layout: { theme: "hell" } });
		const latin1 = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, hex: string) =>
			String.fromCharCode(parseInt(hex, 16)),
		);
		const widgetBlob = btoa(latin1).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
		expect(parseDelta(widgetBlob)).toEqual({ layout: { theme: "hell" } });
	});

	it("ignores a broken link", () => {
		expect(parseDelta("%%%")).toBeNull();
		expect(parseDelta(null)).toBeNull();
	});
});

describe("widgetPalette", () => {
	it("keeps the widget's light and dark schemes", () => {
		expect(widgetPalette(withLayout(defaultWidgetConfig(), { theme: "dunkel" }).layout)).toMatchObject({
			mode: "dark",
			background: "#0f1420",
		});
		expect(widgetPalette(withLayout(defaultWidgetConfig(), { theme: "hell" }).layout).mode).toBe("light");
	});

	it("picks the more readable text for a main colour, and shades the rest from it", () => {
		const onWhite = widgetPalette(
			withLayout(defaultWidgetConfig(), { theme: "hauptfarbe", hauptfarbe: "#ffffff" }).layout,
		);
		expect([onWhite.mode, onWhite.text, onWhite.paper]).toEqual(["light", "#1a2436", "#ebebeb"]);
		const onBlack = widgetPalette(
			withLayout(defaultWidgetConfig(), { theme: "hauptfarbe", hauptfarbe: "#000000" }).layout,
		);
		expect([onBlack.mode, onBlack.text]).toEqual(["dark", "#e6ecf7"]);
	});

	it("takes custom colours as given", () => {
		const layout = withLayout(defaultWidgetConfig(), { theme: "custom" });
		const custom = widgetPalette(withLayout(layout as never, { custom: { schrift: "#ff0000" } as never }).layout);
		expect(custom.text).toBe("#ff0000");
		expect(mixHex("#ffffff", "#000000", 0.5)).toBe("#808080");
	});
});
