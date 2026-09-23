import { describe, expect, it } from "vitest";
import english from "@i18n/en.json";
import {
	CLEAN_MODES,
	CLEAN_ROUTES,
	SUCTION_KEYS,
	modeMops,
	modeVacuums,
	routeChoice,
	routesFor,
	suctionKey,
} from "./cleaningOptions";
import { DUST_BAG_TEXT_KEY, WEAR_PARTS, dustBagSeverity, dustBagTextKey, wearSeverity } from "./maintenance";
import { STATISTICS } from "./statistics";

// English is the complete file; see the comment in errors.test.ts.
const translations = english as Record<string, string>;

describe("cleaning modes", () => {
	it("knows which jobs each mode does", () => {
		expect(modeVacuums(0)).toBe(true);
		expect(modeMops(0)).toBe(false);
		expect(modeMops(1)).toBe(true);
		expect(modeVacuums(1)).toBe(false);
		// Both, in one pass and in two.
		expect(modeVacuums(2) && modeMops(2)).toBe(true);
		expect(modeVacuums(3) && modeMops(3)).toBe(true);
	});
});

describe("routesFor", () => {
	it("drops the mopping intensities while the robot only vacuums", () => {
		// Intensive (2) and deep (3) are mopping intensities; the robot ignores them here, so
		// offering them would offer a setting that does nothing.
		expect(routesFor(0).map(route => route.id)).toEqual([4, 1]);
	});

	it("drops them for vacuum-and-mop in one pass too", () => {
		expect(routesFor(2).map(route => route.id)).toEqual([4, 1]);
	});

	it("offers every route for the mopping modes", () => {
		expect(routesFor(1)).toHaveLength(CLEAN_ROUTES.length);
		expect(routesFor(3)).toHaveLength(CLEAN_ROUTES.length);
	});

	it("offers every route when the mode is not known yet", () => {
		expect(routesFor(null)).toHaveLength(CLEAN_ROUTES.length);
	});
});

describe("suctionKey", () => {
	it("maps a level to its name by index", () => {
		expect(suctionKey(0)).toBe("panel.reinigung.saug.leise");
		expect(suctionKey(3)).toBe("panel.reinigung.saug.turbo");
	});

	it("returns null outside the list rather than an undefined label", () => {
		expect(suctionKey(9)).toBeNull();
		expect(suctionKey(null)).toBeNull();
	});
});

describe("dustBagTextKey", () => {
	it("maps the three documented codes", () => {
		expect(dustBagTextKey(0)).toBe("panel.wartung.saugbeutel.installiert");
		expect(dustBagTextKey(1)).toBe("panel.wartung.saugbeutel.nicht-installiert");
		expect(dustBagTextKey(2)).toBe("panel.wartung.saugbeutel.ueberpruefen");
	});

	it("returns null for an unknown or absent code", () => {
		expect(dustBagTextKey(7)).toBeNull();
		expect(dustBagTextKey(null)).toBeNull();
	});
});

describe("wearSeverity", () => {
	it("turns red at 10 per cent and orange at 20, as the widget does", () => {
		expect(wearSeverity(0)).toBe("bad");
		expect(wearSeverity(10)).toBe("bad");
		expect(wearSeverity(11)).toBe("warn");
		expect(wearSeverity(20)).toBe("warn");
		expect(wearSeverity(21)).toBe("ok");
		expect(wearSeverity(null)).toBe("ok");
	});

	it("colours a missing dust bag red and one to check orange", () => {
		expect([dustBagSeverity(0), dustBagSeverity(1), dustBagSeverity(2), dustBagSeverity(null)]).toEqual([
			"ok",
			"bad",
			"warn",
			"ok",
		]);
	});
});

describe("statistics formatting", () => {
	const byState = (state: string) => STATISTICS.find(entry => entry.state === state)!;

	it("converts total cleaning time from minutes to hours", () => {
		expect(byState("total-cleaning-time").format(120, "en-GB")).toBe("2 h");
	});

	it("reads the first-cleaning date as seconds, not milliseconds", () => {
		// 1_700_000_000 s is November 2023. Read as milliseconds it would be January 1970 - the
		// classic unit slip, and one that looks plausible enough to ship.
		const formatted = byState("first-cleaning-date").format(1_700_000_000, "en-GB");

		expect(formatted).toContain("2023");
	});

	it("gives the area a unit", () => {
		expect(byState("total-cleaned-area").format(1596, "en-GB")).toContain("m²");
	});
});

describe("translation keys", () => {
	// Each of these tables carries keys rather than text precisely so the existing translations
	// apply. A key with no translation renders as the key itself, in every language.
	it("names only keys the language files carry", () => {
		const keys = [
			...CLEAN_MODES.map(entry => entry.key),
			...CLEAN_ROUTES.map(entry => entry.key),
			...SUCTION_KEYS,
			...WEAR_PARTS.map(part => part.nameKey),
			...Object.values(DUST_BAG_TEXT_KEY),
			...STATISTICS.map(entry => entry.nameKey),
		];

		expect(keys.filter(key => !(key in translations))).toEqual([]);
	});
});

describe("routeChoice", () => {
	it("offers just the allowed routes when the robot is already on one", () => {
		const choice = routeChoice(0, 4);

		expect(choice.options.map(entry => entry.id)).toEqual([4, 1]);
		expect(choice.stray).toBeUndefined();
	});

	it("keeps the robot's actual route visible when the mode does not offer it", () => {
		// Vacuum-only mode with the robot left on "deep", which happens because nothing resets the
		// route when the mode changes. The widget shows "quick" here, which is simply wrong.
		const choice = routeChoice(0, 3);

		expect(choice.options.map(entry => entry.id)).toEqual([4, 1, 3]);
		expect(choice.stray?.id).toBe(3);
	});

	it("offers the plain list when the route is not known yet", () => {
		const choice = routeChoice(0, null);

		expect(choice.options.map(entry => entry.id)).toEqual([4, 1]);
		expect(choice.stray).toBeUndefined();
	});

	it("invents no label for a route the table does not know", () => {
		const choice = routeChoice(0, 99);

		expect(choice.options.map(entry => entry.id)).toEqual([4, 1]);
		expect(choice.stray).toBeUndefined();
	});
});
