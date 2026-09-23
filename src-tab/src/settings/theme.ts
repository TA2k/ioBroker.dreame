/**
 * The stand-alone page's colours, from its settings: the widget's four colour modes
 * (`www/css/theme.css`) as a palette for MUI.
 *
 * - Light and dark: the widget's two schemes.
 * - Main colour: one colour the user picks; menu, lines and buttons are shades of it, and the text
 *   is whichever of the two schemes' text colours contrasts more with it - readable on pure white,
 *   pure black and a saturated red alike.
 * - Custom: five colours as given, readable or not; that freedom was the point.
 *
 * Only the page applies these. Inside the admin, vis-2 and the devices app the host's theme
 * applies, as it should for a view that is part of it.
 */

import type { WidgetLayout } from "./widgetConfig";

export interface WidgetPalette {
	mode: "light" | "dark";
	/** Page background. */
	background: string;
	/** Panels and menus. */
	paper: string;
	/** Behind the map. */
	map: string;
	buttons: string;
	divider: string;
	text: string;
	muted: string;
	accent: string;
}

const LIGHT_TEXT = "#e6ecf7";
const DARK_TEXT = "#1a2436";
const ACCENT = "#2bb4e2";

const DARK: WidgetPalette = {
	mode: "dark",
	background: "#0f1420",
	paper: "#171e2e",
	map: "#0f1420",
	buttons: "#1d2740",
	divider: "#2a3550",
	text: LIGHT_TEXT,
	muted: "#8ea0c0",
	accent: ACCENT,
};

const LIGHT: WidgetPalette = {
	mode: "light",
	background: "#eef2f8",
	paper: "#ffffff",
	map: "#eef2f8",
	buttons: "#f4f7fc",
	divider: "#dbe3ef",
	text: DARK_TEXT,
	muted: "#5a6b88",
	accent: ACCENT,
};

/** WCAG relative luminance of a `#rrggbb` colour. */
export function relativeLuminance(hex: string): number {
	const channel = (v: number): number => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
	const value = (from: number): number => channel(parseInt(hex.slice(from, from + 2), 16) / 255);
	return 0.2126 * value(1) + 0.7152 * value(3) + 0.0722 * value(5);
}

/** The schemes' text colour that contrasts more with a background. */
export function readableText(background: string): string {
	const contrast = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
	const bg = relativeLuminance(background);
	return contrast(bg, relativeLuminance(LIGHT_TEXT)) >= contrast(bg, relativeLuminance(DARK_TEXT))
		? LIGHT_TEXT
		: DARK_TEXT;
}

/** CSS `color-mix(in srgb, a <share>%, b)`, worked out. */
export function mixHex(a: string, b: string, share: number): string {
	const part = (hex: string, from: number): number => parseInt(hex.slice(from, from + 2), 16);
	const out = [1, 3, 5].map(from => Math.round(part(a, from) * share + part(b, from) * (1 - share)));
	return `#${out.map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

function isHex(value: unknown): value is string {
	return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function widgetPalette(layout: WidgetLayout): WidgetPalette {
	if (layout.theme === "hell") return LIGHT;

	if (layout.theme === "hauptfarbe") {
		const base = isHex(layout.hauptfarbe) ? layout.hauptfarbe : "#eef2f8";
		const text = readableText(base);
		return {
			mode: text === DARK_TEXT ? "light" : "dark",
			background: base,
			paper: mixHex(base, "#000000", 0.92),
			map: base,
			buttons: mixHex(base, "#000000", 0.84),
			divider: mixHex(base, "#000000", 0.8),
			text,
			muted: mixHex(text, base, 0.65),
			accent: ACCENT,
		};
	}

	if (layout.theme === "custom") {
		const c = layout.custom;
		const menu = isHex(c.menue) ? c.menue : "#ffffff";
		const text = isHex(c.schrift) ? c.schrift : DARK_TEXT;
		return {
			mode: relativeLuminance(menu) > 0.4 ? "light" : "dark",
			background: isHex(c.hintergrund) ? c.hintergrund : "#eef2f8",
			paper: menu,
			map: isHex(c.hintergrund) ? c.hintergrund : "#eef2f8",
			buttons: isHex(c.knoepfe) ? c.knoepfe : "#f4f7fc",
			divider: isHex(c.rahmen) ? c.rahmen : "#dbe3ef",
			text,
			muted: mixHex(text, menu, 0.65),
			accent: ACCENT,
		};
	}

	return DARK;
}
