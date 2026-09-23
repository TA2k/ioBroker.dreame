import { describe, expect, it } from "vitest";
import english from "@i18n/en.json";
import { WASH, stationActions } from "./station";
import type { StationValues } from "./station";

const docked: StationValues = {
	wash: WASH.IDLE,
	dustCollection: 1,
	charging: 1,
	waterTank: 1,
	mopInStation: 1,
	robotStatus: 0,
	cleaningPaused: false,
	drainage: 0,
	autoEmpty: 0,
	state: 6,
};

describe("stationActions", () => {
	it("offers only what the station has", () => {
		expect(stationActions({ ...docked, dustCollection: null }, false).map(a => a.id)).toEqual(["wash", "dry"]);
		expect(stationActions({ ...docked, wash: null }, false).map(a => a.id)).toEqual(["empty"]);
		expect(stationActions({ ...docked, wash: null, dustCollection: null }, false)).toEqual([]);
	});

	it("lets everything be pressed while docked and idle", () => {
		expect(stationActions(docked, false).every(action => !action.disabled)).toBe(true);
	});

	it("turns the wash button into pause and resume", () => {
		const washing = stationActions({ ...docked, wash: WASH.WASHING }, false).find(a => a.id === "wash")!;
		expect([washing.command, washing.disabled]).toEqual(["pauseWash", false]);
		const paused = stationActions({ ...docked, wash: WASH.PAUSED }, false).find(a => a.id === "wash")!;
		expect([paused.command, paused.textKey]).toEqual(["resumeWash", "panel.station.knopf.fortsetzen"]);
	});

	it("says why a button cannot be pressed", () => {
		const noMop = stationActions({ ...docked, waterTank: 0, mopInStation: 0 }, false).find(a => a.id === "wash")!;
		expect([noMop.disabled, noMop.hintKey]).toEqual([true, "panel.station.hinweis.kein-wischpad"]);

		const away = stationActions({ ...docked, charging: 0 }, false).find(a => a.id === "dry")!;
		expect([away.disabled, away.hintKey]).toEqual([true, "panel.station.hinweis.nur-an-station"]);

		const cleaning = stationActions(docked, true).find(a => a.id === "dry")!;
		expect([cleaning.disabled, cleaning.hintKey]).toEqual([true, "panel.station.hinweis.erst-nach-reinigung"]);

		const emptyWhileWashing = stationActions({ ...docked, wash: WASH.WASHING }, false).find(a => a.id === "empty")!;
		expect([emptyWhileWashing.disabled, emptyWhileWashing.hintKey]).toEqual([
			true,
			"panel.station.hinweis.erst-nach-mopp-waschen",
		]);
	});

	it("ends a drying in progress", () => {
		const drying = stationActions({ ...docked, wash: WASH.DRYING }, false).find(a => a.id === "dry")!;
		expect([drying.command, drying.disabled]).toEqual(["stopDry", false]);
	});

	it("names only keys the language files have", () => {
		const states: StationValues[] = [
			docked,
			{ ...docked, wash: WASH.WASHING },
			{ ...docked, wash: WASH.PAUSED },
			{ ...docked, wash: WASH.DRYING, autoEmpty: 1 },
			{ ...docked, charging: 0, waterTank: 0, mopInStation: 0, dustCollection: 0 },
		];
		for (const state of states) {
			for (const action of [...stationActions(state, false), ...stationActions(state, true)]) {
				expect(english).toHaveProperty([action.textKey]);
				expect(english).toHaveProperty([action.hintKey]);
			}
		}
	});
});
