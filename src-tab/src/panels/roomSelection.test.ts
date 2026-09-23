import { describe, expect, it } from "vitest";
import { parseRoomSwitches, roomSwitchPrefix, selectedRooms, selectionSummary, switchOf } from "./roomSelection";
import { orderApplies } from "./sequence";

const object = (native: Record<string, unknown>): ioBroker.Object =>
	({ type: "state", common: {}, native }) as unknown as ioBroker.Object;

describe("parseRoomSwitches", () => {
	it("identifies each room by native.roomId, not by the readable id", () => {
		const prefix = roomSwitchPrefix("dreame.0", "abc", 3);
		expect(prefix).toBe("dreame.0.abc.remote.custom-room-cleaning.map-3.");
		expect(
			parseRoomSwitches({
				[`${prefix}kitchen`]: object({ roomId: 5 }),
				[`${prefix}room-2`]: object({ roomId: "2" }),
			}),
		).toEqual([
			{ stateId: `${prefix}room-2`, roomId: 2 },
			{ stateId: `${prefix}kitchen`, roomId: 5 },
		]);
	});

	it("skips objects that are not a room's switch", () => {
		expect(parseRoomSwitches({ a: object({}), b: object({ roomId: "" }), c: object({ roomId: "x" }) })).toEqual([]);
	});
});

describe("selectedRooms", () => {
	const switches = [
		{ stateId: "a", roomId: 1 },
		{ stateId: "b", roomId: 2 },
		{ stateId: "c", roomId: 3 },
	];

	it("holds the rooms whose switch is on", () => {
		expect([...selectedRooms(switches, { a: true, b: false, c: "true" })].sort()).toEqual([1, 3]);
	});

	it("is empty while no value has arrived", () => {
		expect(selectedRooms(switches, {}).size).toBe(0);
	});

	it("finds a room's switch", () => {
		expect(switchOf(switches, 2)?.stateId).toBe("b");
		expect(switchOf(switches, 9)).toBeUndefined();
	});
});

describe("selectionSummary", () => {
	it("says all rooms are active when none is picked, and counts a pick", () => {
		expect(selectionSummary(0)).toEqual({ key: "panel.reinigung.raum.alle", count: null });
		expect(selectionSummary(1)).toEqual({ key: "panel.reinigung.raum.gewaehlt-eins", count: null });
		expect(selectionSummary(4)).toEqual({ key: "panel.reinigung.raum.gewaehlt-mehrere", count: 4 });
	});
});

describe("orderApplies", () => {
	it("holds only for a pick of exactly the order's rooms", () => {
		expect(orderApplies([3, 1], new Set([1, 3]))).toBe(true);
		expect(orderApplies([3, 1], new Set([1, 3, 4]))).toBe(false);
		expect(orderApplies([3, 1], new Set([1]))).toBe(false);
	});

	it("never holds without an order, or without a pick - that is a whole-home clean", () => {
		expect(orderApplies([], new Set())).toBe(false);
		expect(orderApplies([], new Set([1]))).toBe(false);
		expect(orderApplies([1], new Set())).toBe(false);
	});
});
