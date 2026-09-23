/**
 * The rows of the water and mop panel, as the widget lays them out (`www/js/panels/
 * frischwasser.js`).
 *
 * ## Where "mop fitted" comes from
 *
 * Two states can say it, and neither always can. `status.water-tank` holds the answer steadily,
 * but only on the models the adapter remaps it for - r6001 and r9419, where its object lists
 * exactly the states 0 and 1. Everywhere else it means something else, and the pulse state
 * `status.mop-pad-installed` is the only source. So the object decides which state is read.
 *
 * ## Temperature in the adapter's words
 *
 * The water temperature is a level; its names come from the state object's `common.states`,
 * which the adapter fills in its configured language. A level the object does not name is shown
 * as "level N".
 */

import type { StateValues } from "../connection/useStates";

/** Tank bookkeeping of the adapter, `config.tank.status`. */
export type TankStatus = "ok" | "warn" | "critical";

/** Below this, the remaining water is shown in the critical colour whatever the status says. */
export const LOW_WATER_ML = 100;

export const WATER_SUFFIX = {
	capacity: "config.tank.capacity-ml",
	counter: "config.tank.wash-counter",
	remaining: "config.tank.remaining-ml",
	remainingWashes: "config.tank.remaining-washes",
	tankStatus: "config.tank.status",
	tankInstalled: "status.clean-water-tank-installed",
	tankLow: "status.clean-water-tank-low",
	mopPulse: "status.mop-pad-installed",
	waterTank: "status.water-tank",
	wetness: "remote.wetness-level",
	temperature: "remote.water-temperature",
	detergentLeft: "status.detergent-left",
	detergentTimeLeft: "status.detergent-time-left",
} as const;

export type WaterField = keyof typeof WATER_SUFFIX;

/** A row: its id - the widget's, used to hide it - label key and text. */
export interface WaterRow {
	id: "wasch-zyklen" | "tank-status" | "mopp-montiert" | "feuchtigkeit" | "reinigungsmittel" | "temperatur";
	labelKey: string;
	/** Translated already, as it mixes numbers and words. */
	text: string;
}

export interface WaterLevel {
	remainingMl: number;
	capacityMl: number;
	percent: number;
	status: TankStatus;
	/** Under {@link LOW_WATER_ML}: shown in the critical colour. */
	nearlyEmpty: boolean;
}

export interface WaterView {
	level: WaterLevel | null;
	rows: WaterRow[];
	/** The adapter's warning for the tank, as a translation key. */
	warningKey: string | null;
	warningCritical: boolean;
}

export interface WaterMeta {
	/** `common.states` of `status.water-tank`, which says whether it can be read as "mop fitted". */
	waterTankStates: Readonly<Record<string, string>> | null;
	/** `common.states` of `remote.water-temperature`: the names of the levels. */
	temperatureStates: Readonly<Record<string, string>> | null;
}

/** Whether `status.water-tank` is the remapped, reliable "mop fitted" state. */
export function waterTankIsMopState(states: Readonly<Record<string, string>> | null): boolean {
	if (!states) return false;
	const keys = Object.keys(states);
	return keys.length === 2 && keys.includes("0") && keys.includes("1");
}

function number(value: unknown): number | null {
	if (value == null || value === "") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Builds the panel's content.
 *
 * @param value the value of a field, by name
 * @param t the translation function
 */
export function waterView(
	value: (field: WaterField) => unknown,
	meta: WaterMeta,
	t: (key: string) => string,
): WaterView {
	const remaining = number(value("remaining"));
	const capacity = number(value("capacity"));
	const rawStatus = value("tankStatus");
	const status: TankStatus = rawStatus === "warn" || rawStatus === "critical" ? rawStatus : "ok";

	const level: WaterLevel | null =
		remaining != null && capacity != null
			? {
					remainingMl: remaining,
					capacityMl: capacity,
					percent: capacity > 0 ? Math.max(0, Math.min(100, (remaining / capacity) * 100)) : 0,
					status,
					nearlyEmpty: remaining < LOW_WATER_ML,
				}
			: null;

	const rows: WaterRow[] = [];

	const counter = value("counter");
	if (counter != null) {
		const left = value("remainingWashes");
		rows.push({
			id: "wasch-zyklen",
			labelKey: "panel.frischwasser.wasch-zyklen.label",
			text:
				`${String(counter)} ${t("panel.frischwasser.wasch-zyklen.verbraucht")}` +
				(left != null ? ` (~${String(left)} ${t("panel.frischwasser.wasch-zyklen.uebrig")})` : ""),
		});
	}

	const installed = value("tankInstalled");
	if (installed != null) {
		rows.push({
			id: "tank-status",
			labelKey: "panel.frischwasser.tank-status.label",
			text: t(
				!installed
					? "panel.frischwasser.tank-status.draussen"
					: value("tankLow")
						? "panel.frischwasser.tank-status.eingesetzt-niedrig"
						: "panel.frischwasser.tank-status.eingesetzt",
			),
		});
	}

	const mop = waterTankIsMopState(meta.waterTankStates) ? value("waterTank") : value("mopPulse");
	if (mop != null) {
		rows.push({
			id: "mopp-montiert",
			labelKey: "panel.frischwasser.mopp-montiert.label",
			text: Number(mop) === 1 ? "✓" : "✗",
		});
	}

	const wetness = value("wetness");
	if (wetness != null) {
		rows.push({ id: "feuchtigkeit", labelKey: "panel.frischwasser.feuchtigkeit.label", text: String(wetness) });
	}

	const detergent = value("detergentLeft");
	if (detergent != null) {
		const hours = value("detergentTimeLeft");
		rows.push({
			id: "reinigungsmittel",
			labelKey: "panel.frischwasser.reinigungsmittel.label",
			text:
				`${String(detergent)} %` +
				(hours != null ? ` (~${String(hours)} h ${t("panel.frischwasser.reinigungsmittel.uebrig")})` : ""),
		});
	}

	const temperature = value("temperature");
	if (temperature != null) {
		rows.push({
			id: "temperatur",
			labelKey: "panel.frischwasser.temperatur.label",
			text:
				meta.temperatureStates?.[String(temperature)] ??
				`${t("panel.frischwasser.temperatur.stufe-praefix")} ${String(temperature)}`,
		});
	}

	return {
		level,
		rows,
		warningKey: status === "ok" ? null : `panel.frischwasser.warnung.${status}`,
		warningCritical: status === "critical",
	};
}

/** Reads the fields out of state values fetched by `waterStateIds`. */
export function waterValue(values: StateValues, prefix: string): (field: WaterField) => unknown {
	return field => values[prefix + WATER_SUFFIX[field]];
}

/** Every state the panel reads, under `<instance>.<did>.`. */
export function waterStateIds(prefix: string): string[] {
	return Object.values(WATER_SUFFIX).map(suffix => prefix + suffix);
}
