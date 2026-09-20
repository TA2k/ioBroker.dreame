import { describe, expect, it } from "vitest";
import german from "@i18n/de.json";
import { KNOWN_STATUS_CODES, STATUS_TEXT_KEY, statusTextKey } from "./statusCodes";

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
		const missing = Object.values(STATUS_TEXT_KEY).filter(key => !(key in (german as Record<string, string>)));

		expect(missing).toEqual([]);
	});
});
