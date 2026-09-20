import { describe, expect, it } from "vitest";
import { PathType, buildTrailPaths, isMop, isVacuum, sectionTypes, worldToImage } from "./trail";
import type { MapHeader, MapPackage, PathPoint } from "./mapPackage";

const header: MapHeader = {
	gridSize: 50,
	width: 10,
	height: 10,
	origin: { x: 0, y: 0 },
	robot: null,
};

function mapWith(points: PathPoint[], over: Partial<MapHeader> = {}): MapPackage {
	return {
		header: { ...header, ...over },
		cells: new Uint8Array(100),
		meta: { trpts: points },
	};
}

describe("worldToImage", () => {
	it("scales x by the grid and shifts it by the origin", () => {
		expect(worldToImage(500, 0, header).x).toBe(10);
		expect(worldToImage(500, 0, { ...header, origin: { x: 250, y: 0 } }).x).toBe(5);
	});

	it("uses Home Assistant's exact y term, not the off-by-one-cell shortcut", () => {
		// (height * gridSize - 1 - (y - originY)) / gridSize = (10*50 - 1 - 0) / 50 = 9.98.
		// The shortcut `height - 1 - y/gridSize` would give 9 - a whole cell out.
		expect(worldToImage(0, 0, header).y).toBeCloseTo(9.98, 5);
	});

	it("moves down the image as world y decreases", () => {
		const high = worldToImage(0, 400, header).y;
		const low = worldToImage(0, 100, header).y;

		expect(low).toBeGreaterThan(high);
	});
});

describe("sectionTypes", () => {
	it("treats a run with no type at all as vacuuming", () => {
		const types = sectionTypes([
			[0, 0, 0],
			[1, 1, 0],
		]);

		expect(types).toEqual([PathType.VACUUM, PathType.VACUUM]);
	});

	it("carries a section type forward across continuation points", () => {
		const types = sectionTypes([
			[0, 0, PathType.MOP],
			[1, 1, PathType.CONTINUE],
			[2, 2, PathType.CONTINUE],
		]);

		expect(types).toEqual([PathType.MOP, PathType.MOP, PathType.MOP]);
	});

	it("switches at every new section", () => {
		const types = sectionTypes([
			[0, 0, PathType.VACUUM],
			[1, 1, PathType.MOP],
			[2, 2, PathType.CONTINUE],
			[3, 3, PathType.VACUUM_AND_MOP],
		]);

		expect(types).toEqual([PathType.VACUUM, PathType.MOP, PathType.MOP, PathType.VACUUM_AND_MOP]);
	});
});

describe("isVacuum / isMop", () => {
	it("puts a combined section in both trails", () => {
		expect(isVacuum(PathType.VACUUM_AND_MOP)).toBe(true);
		expect(isMop(PathType.VACUUM_AND_MOP)).toBe(true);
	});

	it("keeps pure sections in one trail each", () => {
		expect(isVacuum(PathType.VACUUM)).toBe(true);
		expect(isMop(PathType.VACUUM)).toBe(false);
		expect(isMop(PathType.MOP)).toBe(true);
		expect(isVacuum(PathType.MOP)).toBe(false);
	});
});

describe("buildTrailPaths", () => {
	it("returns empty paths when there is no trail", () => {
		expect(buildTrailPaths(mapWith([]))).toEqual({ vacuum: "", mop: "" });
	});

	it("draws a continuous run as one move followed by lines", () => {
		const { vacuum } = buildTrailPaths(
			mapWith([
				[0, 500, PathType.VACUUM],
				[50, 500, PathType.CONTINUE],
				[100, 500, PathType.CONTINUE],
			]),
		);

		expect(vacuum.startsWith("M")).toBe(true);
		expect(vacuum.match(/M/g)).toHaveLength(1);
		expect(vacuum.match(/L/g)).toHaveLength(2);
	});

	it("lifts the line at a new section rather than dashing across the flat", () => {
		// Two vacuuming runs with a reposition between them: two moves, not one long line.
		const { vacuum } = buildTrailPaths(
			mapWith([
				[0, 500, PathType.VACUUM],
				[50, 500, PathType.CONTINUE],
				[900, 500, PathType.VACUUM],
				[950, 500, PathType.CONTINUE],
			]),
		);

		expect(vacuum.match(/M/g)).toHaveLength(2);
	});

	it("keeps a combined section in both paths", () => {
		const { vacuum, mop } = buildTrailPaths(
			mapWith([
				[0, 500, PathType.VACUUM_AND_MOP],
				[50, 500, PathType.CONTINUE],
			]),
		);

		expect(vacuum).not.toBe("");
		expect(mop).not.toBe("");
		expect(vacuum).toBe(mop);
	});

	it("leaves a mopping-only section out of the vacuum path", () => {
		const { vacuum, mop } = buildTrailPaths(
			mapWith([
				[0, 500, PathType.MOP],
				[50, 500, PathType.CONTINUE],
			]),
		);

		expect(vacuum).toBe("");
		expect(mop).not.toBe("");
	});

	it("lifts the line where the run left this path and came back", () => {
		// Vacuum, then mop, then vacuum again: the vacuum path must not join across the mop part.
		const { vacuum } = buildTrailPaths(
			mapWith([
				[0, 500, PathType.VACUUM],
				[50, 500, PathType.CONTINUE],
				[100, 500, PathType.MOP],
				[150, 500, PathType.CONTINUE],
				[200, 500, PathType.VACUUM],
				[250, 500, PathType.CONTINUE],
			]),
		);

		expect(vacuum.match(/M/g)).toHaveLength(2);
		expect(vacuum.match(/L/g)).toHaveLength(2);
	});

	it("places points in the same flipped space the floor uses", () => {
		// World y = 0 is the bottom of the map, so it belongs near the bottom of the image.
		const { vacuum } = buildTrailPaths(mapWith([[0, 0, PathType.VACUUM]]));

		expect(vacuum).toBe("M0.0 10.0");
	});
});
