import { describe, expect, it } from "vitest";
import { asBoolean, asNumber } from "./useStates";

describe("asNumber", () => {
	it("reads numbers and numeric strings", () => {
		expect(asNumber(42)).toBe(42);
		expect(asNumber("42")).toBe(42);
		expect(asNumber(0)).toBe(0);
	});

	it("returns null for absent or unreadable values rather than NaN", () => {
		// NaN would flow on into arithmetic and surface much later as a blank percentage.
		expect(asNumber(null)).toBeNull();
		expect(asNumber(undefined)).toBeNull();
		expect(asNumber("")).toBeNull();
		expect(asNumber("abc")).toBeNull();
		expect(asNumber(Infinity)).toBeNull();
	});
});

describe("asBoolean", () => {
	it("passes booleans through", () => {
		expect(asBoolean(true)).toBe(true);
		expect(asBoolean(false)).toBe(false);
	});

	it("reads the numeric form ioBroker also carries", () => {
		// The same flag arrives as a boolean from one adapter path and as 0/1 from another.
		expect(asBoolean(1)).toBe(true);
		expect(asBoolean(0)).toBe(false);
	});

	it("reads the string forms", () => {
		expect(asBoolean("true")).toBe(true);
		expect(asBoolean("false")).toBe(false);
		expect(asBoolean("1")).toBe(true);
		expect(asBoolean("0")).toBe(false);
	});

	it("returns null for absent or unreadable values", () => {
		expect(asBoolean(null)).toBeNull();
		expect(asBoolean(undefined)).toBeNull();
		expect(asBoolean("")).toBeNull();
		expect(asBoolean("maybe")).toBeNull();
	});
});
