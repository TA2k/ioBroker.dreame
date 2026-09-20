import { describe, expect, it } from "vitest";
import german from "@i18n/de.json";
import {
	ERROR_TEXT_KEY,
	KNOWN_ERROR_CODES,
	WARNING_CODES,
	collectMessages,
	isSuppressed,
} from "./errors";
import { parseOrder, sequencePosition, serialiseOrder, toggleRoom } from "./sequence";

const translations = german as Record<string, string>;
const noContext = { charging: null, wash: null };

describe("ERROR_TEXT_KEY", () => {
	it("still holds every entry that was ported", () => {
		expect(Object.keys(ERROR_TEXT_KEY)).toHaveLength(KNOWN_ERROR_CODES);
	});

	it("names only keys the language files carry", () => {
		const missing = Object.values(ERROR_TEXT_KEY).filter(key => !(key in translations));

		expect(missing).toEqual([]);
	});
});

describe("isSuppressed", () => {
	it("hides the two collective codes, which say nothing to act on", () => {
		expect(isSuppressed(84, noContext)).toBe(true);
		expect(isSuppressed(122, noContext)).toBe(true);
	});

	it("hides a low battery only while charging", () => {
		expect(isSuppressed(20, { charging: 1, wash: null })).toBe(true);
		expect(isSuppressed(20, { charging: 0, wash: null })).toBe(false);
	});

	it("hides remove-the-mop only where a washing station exists", () => {
		expect(isSuppressed(68, { charging: null, wash: 0 })).toBe(true);
		expect(isSuppressed(114, { charging: null, wash: 0 })).toBe(true);
		expect(isSuppressed(68, noContext)).toBe(false);
	});

	it("shows an ordinary fault", () => {
		expect(isSuppressed(12, noContext)).toBe(false);
	});
});

describe("collectMessages", () => {
	it("reports nothing when nothing is wrong", () => {
		expect(collectMessages({ error: 0 }, noContext)).toEqual([]);
	});

	it("reports a fault as severe", () => {
		const messages = collectMessages({ error: 12 }, noContext);

		expect(messages).toHaveLength(1);
		expect(messages[0]).toMatchObject({ source: "error", severe: true });
		expect(messages[0]?.textKey).toBe(ERROR_TEXT_KEY[12]);
	});

	it("reports a code from the warning set as not severe", () => {
		const code = [...WARNING_CODES].find(entry => entry !== 20 && entry !== 122 && entry !== 68)!;

		expect(collectMessages({ error: code }, noContext)[0]?.severe).toBe(false);
	});

	it("keeps an unknown code as a number rather than inventing a label", () => {
		// A number can be quoted in an issue; an invented label sends everyone the wrong way.
		const messages = collectMessages({ error: 9999 }, noContext);

		expect(messages[0]).toMatchObject({ textKey: null, unknownCode: 9999 });
	});

	it("leaves out a suppressed code entirely", () => {
		expect(collectMessages({ error: 20 }, { charging: 1, wash: null })).toEqual([]);
	});

	it("reports the flag states when they are non-zero", () => {
		const messages = collectMessages({ "dust-bag-status": 1, "low-water-warning": 2 }, noContext);

		expect(messages.map(message => message.source)).toEqual(["low-water-warning", "dust-bag-status"]);
		expect(messages.every(message => !message.severe)).toBe(true);
	});

	it("ignores a flag state at zero", () => {
		expect(collectMessages({ "dust-bag-status": 0 }, noContext)).toEqual([]);
	});

	it("reports a fault and a flag together", () => {
		const messages = collectMessages({ error: 12, "dust-bag-status": 1 }, noContext);

		expect(messages).toHaveLength(2);
	});
});

describe("sequence order", () => {
	it("reads an order from its JSON state", () => {
		expect(parseOrder("[3,1,2]")).toEqual([3, 1, 2]);
	});

	it("yields an empty order for anything unreadable", () => {
		expect(parseOrder(null)).toEqual([]);
		expect(parseOrder("")).toEqual([]);
		expect(parseOrder("{not json")).toEqual([]);
		expect(parseOrder('{"a":1}')).toEqual([]);
	});

	it("drops entries that are not numbers", () => {
		expect(parseOrder('[1,"x",2]')).toEqual([1, 2]);
	});

	it("appends a new room, which is what makes tap order the cleaning order", () => {
		expect(toggleRoom([3, 1], 2)).toEqual([3, 1, 2]);
	});

	it("removes a room already in the order and leaves the rest in place", () => {
		expect(toggleRoom([3, 1, 2], 1)).toEqual([3, 2]);
	});

	it("leaves the order untouched for a room id that is not a number", () => {
		expect(toggleRoom([3, 1], Number.NaN)).toEqual([3, 1]);
	});

	it("does not mutate the order it was given", () => {
		const order = [3, 1];
		toggleRoom(order, 2);

		expect(order).toEqual([3, 1]);
	});

	it("numbers positions from 1, because a person reads them", () => {
		expect(sequencePosition([3, 1, 2], 3)).toBe(1);
		expect(sequencePosition([3, 1, 2], 2)).toBe(3);
	});

	it("reports no position for a room outside the order", () => {
		expect(sequencePosition([3, 1], 9)).toBeNull();
	});

	it("serialises to the form the state takes", () => {
		expect(serialiseOrder([3, 1])).toBe("[3,1]");
		expect(serialiseOrder([])).toBe("[]");
	});
});
