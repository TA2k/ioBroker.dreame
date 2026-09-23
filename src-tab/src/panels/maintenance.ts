/**
 * Wear parts and the dust bag.
 *
 * Ported from the widget (`www/js/panels/wartung.js`). Each part reports the percentage of life
 * left in a `status.*-left` state and has a reset trigger for when the part is replaced.
 *
 * The dust bag is deliberately not one of them: it is exchanged, not reset, so it carries a
 * status instead of a percentage and has no action.
 */

/** One wear part. */
export interface WearPart {
	/** State suffix under `<did>.status.`, carrying the percentage left. */
	state: string;
	/** Translation key for the part's name. */
	nameKey: string;
	/** Trigger suffix under `<did>.remote.` that resets the counter. */
	resetTrigger: string;
}

export const WEAR_PARTS: readonly WearPart[] = [
	{ state: "main-brush-left", nameKey: "panel.wartung.hauptbuerste.label", resetTrigger: "reset-main-brush" },
	{ state: "side-brush-left", nameKey: "panel.wartung.seitenbuerste.label", resetTrigger: "reset-side-brush" },
	{ state: "filter-left", nameKey: "panel.wartung.filter.label", resetTrigger: "reset-filter" },
	{ state: "sensor-dirty-left", nameKey: "panel.wartung.sensoren.label", resetTrigger: "reset-sensor" },
];

/** State suffix carrying the dust bag's status. */
export const DUST_BAG_STATE = "dust-bag-status";

/** Dust bag status codes, from the station spec (SIID 27 / PIID 3). */
export const DUST_BAG_TEXT_KEY: Readonly<Record<number, string>> = {
	0: "panel.wartung.saugbeutel.installiert",
	1: "panel.wartung.saugbeutel.nicht-installiert",
	2: "panel.wartung.saugbeutel.ueberpruefen",
};

/** The translation key for a dust bag status, or null where the code is unknown. */
export function dustBagTextKey(code: number | null): string | null {
	if (code == null) return null;
	return DUST_BAG_TEXT_KEY[code] ?? null;
}

/**
 * How alarming a remaining percentage is.
 *
 * The thresholds are a display choice, not something the robot reports: it gives a number and
 * nothing else. They are the widget's - 20 per cent is time to order a replacement, 10 is time to
 * fit it - so the parts turn orange and red at the same point in every view.
 */
export function wearSeverity(percent: number | null): "ok" | "warn" | "bad" {
	if (percent == null) return "ok";
	if (percent <= 10) return "bad";
	if (percent <= 20) return "warn";
	return "ok";
}

/** The dust bag's state as a severity, as the widget colours it: missing is bad, "check" a warning. */
export function dustBagSeverity(code: number | null): "ok" | "warn" | "bad" {
	if (code === 1) return "bad";
	if (code === 2) return "warn";
	return "ok";
}
