import { describe, expect, it } from "vitest";
import english from "@i18n/en.json";
import german from "@i18n/de.json";
import { waterTankIsMopState, waterView } from "./water";
import type { WaterField } from "./water";
import { parseCommonStates } from "../connection/useObjectStates";

// German where it has a word of its own, English otherwise - exactly what `I18n.t` does, now
// that a language file holds only what differs from English.
const t = (key: string): string =>
	(german as Record<string, string>)[key] ?? (english as Record<string, string>)[key] ?? key;
const values =
	(entries: Partial<Record<WaterField, unknown>>) =>
	(field: WaterField): unknown =>
		entries[field];
const noMeta = { waterTankStates: null, temperatureStates: null };

describe("waterView", () => {
	it("shows the level with the adapter's tank status, and its warning", () => {
		const view = waterView(values({ remaining: 1500, capacity: 4000, tankStatus: "warn" }), noMeta, t);
		expect(view.level).toEqual({
			remainingMl: 1500,
			capacityMl: 4000,
			percent: 37.5,
			status: "warn",
			nearlyEmpty: false,
		});
		expect(view.warningKey).toBe("panel.frischwasser.warnung.warn");
		expect(view.warningCritical).toBe(false);
	});

	it("marks under 100 ml as nearly empty, and reads an unknown status as ok", () => {
		const view = waterView(values({ remaining: 50, capacity: 4000, tankStatus: "?" }), noMeta, t);
		expect(view.level?.nearlyEmpty).toBe(true);
		expect(view.warningKey).toBeNull();
	});

	it("builds the rows the device reports, and only those", () => {
		const view = waterView(
			values({
				counter: 3,
				remainingWashes: 17,
				tankInstalled: true,
				tankLow: true,
				detergentLeft: 40,
				detergentTimeLeft: 12,
			}),
			noMeta,
			t,
		);
		expect(view.rows.map(row => [row.id, row.text])).toEqual([
			["wasch-zyklen", "3 verbraucht (~17 übrig)"],
			["tank-status", "eingesetzt, Wasser niedrig ⚠"],
			["reinigungsmittel", "40 % (~12 h übrig)"],
		]);
	});

	it("reads 'mop fitted' from water-tank only where the adapter remapped it to 0 and 1", () => {
		const both = values({ waterTank: 1, mopPulse: 0 });
		expect(waterView(both, noMeta, t).rows[0]?.text).toBe("✗");
		const remapped = { waterTankStates: { "0": "no", "1": "yes" }, temperatureStates: null };
		expect(waterView(both, remapped, t).rows[0]?.text).toBe("✓");
		expect(waterTankIsMopState({ "0": "a", "1": "b", "10": "c" })).toBe(false);
	});

	it("names the temperature in the adapter's words, or as a level", () => {
		const named = { waterTankStates: null, temperatureStates: { "2": "Warm" } };
		expect(waterView(values({ temperature: 2 }), named, t).rows[0]?.text).toBe("Warm");
		expect(waterView(values({ temperature: 3 }), named, t).rows[0]?.text).toBe("Stufe 3");
	});

	it("names only keys the language files have", () => {
		const view = waterView(
			values({
				remaining: 1,
				capacity: 2,
				tankStatus: "critical",
				counter: 1,
				tankInstalled: false,
				mopPulse: 1,
				wetness: 5,
				temperature: 1,
			}),
			noMeta,
			t,
		);
		for (const row of view.rows) expect(english).toHaveProperty([row.labelKey]);
		expect(english).toHaveProperty([view.warningKey!]);
	});
});

describe("parseCommonStates", () => {
	it("reads both forms ioBroker allows", () => {
		expect(parseCommonStates({ 0: "off", 1: "on" })).toEqual({ "0": "off", "1": "on" });
		expect(parseCommonStates("0:off;1:on")).toEqual({ "0": "off", "1": "on" });
		expect(parseCommonStates(undefined)).toBeNull();
	});
});
