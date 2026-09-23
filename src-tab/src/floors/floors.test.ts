import { describe, expect, it } from "vitest";
import { LIVE_FLOOR, floorSource, parseFloors } from "./floors";

const PREFIX = "dreame.0.abc.map.maps.";

describe("parseFloors", () => {
	it("reads each stored map as a floor", () => {
		const floors = parseFloors(
			{
				[`${PREFIX}1.mapName`]: "Erdgeschoss",
				[`${PREFIX}5.mapName`]: "Obergeschoss",
			},
			PREFIX,
		);

		expect(floors).toEqual([
			{ id: "1", name: "Erdgeschoss" },
			{ id: "5", name: "Obergeschoss" },
		]);
	});

	it("skips the adapter's `current` alias, which would list one storey twice", () => {
		const floors = parseFloors(
			{
				[`${PREFIX}current.mapName`]: "Erdgeschoss",
				[`${PREFIX}1.mapName`]: "Erdgeschoss",
			},
			PREFIX,
		);

		expect(floors.map(floor => floor.id)).toEqual(["1"]);
	});

	it("sorts by map number, not alphabetically", () => {
		const floors = parseFloors(
			{
				[`${PREFIX}53.mapName`]: "A",
				[`${PREFIX}7.mapName`]: "B",
			},
			PREFIX,
		);

		expect(floors.map(floor => floor.id)).toEqual(["7", "53"]);
	});

	it("falls back to the adapter's default name for an empty one", () => {
		expect(parseFloors({ [`${PREFIX}3.mapName`]: "" }, PREFIX)[0]?.name).toBe("Map 3");
	});

	it("ignores states that are not a floor's name", () => {
		const floors = parseFloors(
			{
				[`${PREFIX}1.image`]: "data:image/png;base64,",
				[`${PREFIX}1.info.name`]: "nested",
				[`${PREFIX}1.mapName`]: "Floor",
			},
			PREFIX,
		);

		expect(floors).toEqual([{ id: "1", name: "Floor" }]);
	});

	it("ignores another device's floors", () => {
		expect(parseFloors({ "dreame.0.other.map.maps.1.mapName": "X" }, PREFIX)).toEqual([]);
	});
});

describe("floorSource", () => {
	it("shows the live map when following the robot", () => {
		expect(floorSource(LIVE_FLOOR, 5, PREFIX)).toEqual({ kind: "live" });
	});

	it("shows the live map when the chosen floor is the one the robot is on", () => {
		// The live package's own map id is what makes this safe - not the room-cleaning selector.
		expect(floorSource("5", 5, PREFIX)).toEqual({ kind: "live" });
	});

	it("shows the stored picture for any other floor", () => {
		expect(floorSource("1", 5, PREFIX)).toEqual({ kind: "image", stateId: `${PREFIX}1.image` });
	});

	it("waits rather than guessing while the live map has not arrived", () => {
		// Guessing "image" would flash a stale picture before the live map replaced it.
		expect(floorSource("1", null, PREFIX)).toEqual({ kind: "pending" });
	});

	it("does not wait when following the robot, which needs no comparison", () => {
		expect(floorSource(LIVE_FLOOR, null, PREFIX)).toEqual({ kind: "live" });
	});
});
