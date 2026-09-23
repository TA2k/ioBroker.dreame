import { describe, expect, it } from "vitest";
import english from "@i18n/en.json";
import { KNOWN_STATUS_CODES, STATUS_TEXT_KEY, isStarted, statusTextKey } from "./statusCodes";

describe("statusTextKey", () => {
	it("resolves codes the robot reports every day", () => {
		expect(statusTextKey(1)).toBe("panel.kopf.status.reinigung");
		expect(statusTextKey(6)).toBe("panel.kopf.status.laden");
		expect(statusTextKey(13)).toBe("panel.kopf.status.laden-beendet");
	});

	it("resolves -1, which the robot uses for a state unknown to itself", () => {
		expect(statusTextKey(-1)).toBe("panel.kopf.status.unbekannt");
	});

	it("returns null for a code the table does not know, rather than guessing", () => {
		// The caller shows the bare number instead, which a user can quote in an issue.
		expect(statusTextKey(9999)).toBeNull();
	});

	it("returns null for no code at all", () => {
		expect(statusTextKey(null)).toBeNull();
		expect(statusTextKey(undefined)).toBeNull();
	});
});

describe("STATUS_TEXT_KEY", () => {
	it("still holds every entry that was ported", () => {
		// Guards against a truncated copy: the table was generated from the widget's own, and a
		// half-ported table would silently turn known states into bare numbers.
		expect(Object.keys(STATUS_TEXT_KEY)).toHaveLength(KNOWN_STATUS_CODES);
	});

	it("names only keys that the translation files actually carry", () => {
		// The whole point of reusing the widget's keys is that the 11 language files already have
		// them. A key with no translation would render as the key itself, in every language.
		const missing = Object.values(STATUS_TEXT_KEY).filter(key => !(key in (english as Record<string, string>)));

		expect(missing).toEqual([]);
	});
});

describe("isStarted", () => {
	it("is not started while nothing is known about the device", () => {
		expect(isStarted(null, null, false)).toBe(false);
	});

	it("is not started with the task completed or paused at the dock, and the robot idle", () => {
		expect(isStarted(0, 13, false)).toBe(false);
		expect(isStarted(11, 13, false)).toBe(false);
	});

	it("is started by any other task status, as Home Assistant reads it", () => {
		expect(isStarted(1, 13, false)).toBe(true);
		// Only the robot status known: the missing task status counts as unknown, so started.
		expect(isStarted(null, 13, false)).toBe(true);
	});

	it("is started while paused, or while the robot status is a task's", () => {
		expect(isStarted(0, 13, true)).toBe(true);
		expect(isStarted(0, 18, false)).toBe(true);
		expect(isStarted(0, 25, false)).toBe(true);
	});

	it("does not count returning home as a task of its own", () => {
		expect(isStarted(0, 3, false)).toBe(false);
	});
});
