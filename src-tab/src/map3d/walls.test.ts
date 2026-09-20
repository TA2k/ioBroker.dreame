import { describe, expect, it } from "vitest";
import { countWallCells, mergeWalls } from "./walls";
import { PixelType } from "../map/mapPackage";

const W = PixelType.WALL;
const F = PixelType.FLOOR;

/** Builds a grid from rows of equal length. */
function grid(rows: number[][]): { cells: Uint8Array; width: number; height: number } {
	const height = rows.length;
	const width = rows[0]?.length ?? 0;
	return { cells: new Uint8Array(rows.flat()), width, height };
}

/** Total area of the rectangles, which must equal the number of wall cells. */
function area(rects: { width: number; height: number }[]): number {
	return rects.reduce((sum, rect) => sum + rect.width * rect.height, 0);
}

describe("mergeWalls", () => {
	it("returns nothing for a grid with no walls", () => {
		const { cells, width, height } = grid([
			[F, F],
			[F, F],
		]);

		expect(mergeWalls(cells, width, height)).toEqual([]);
	});

	it("returns nothing for an empty grid", () => {
		expect(mergeWalls(new Uint8Array(0), 0, 0)).toEqual([]);
	});

	it("merges a straight horizontal wall into one box", () => {
		const { cells, width, height } = grid([[W, W, W, W]]);

		expect(mergeWalls(cells, width, height)).toEqual([{ x: 0, y: 0, width: 4, height: 1 }]);
	});

	it("merges a straight vertical wall into one box", () => {
		const { cells, width, height } = grid([[W], [W], [W]]);

		expect(mergeWalls(cells, width, height)).toEqual([{ x: 0, y: 0, width: 1, height: 3 }]);
	});

	it("merges a thick wall into one box rather than layers of them", () => {
		// The reason no separate "discard enclosed cells" pass is needed.
		const { cells, width, height } = grid([
			[W, W, W],
			[W, W, W],
		]);

		expect(mergeWalls(cells, width, height)).toEqual([{ x: 0, y: 0, width: 3, height: 2 }]);
	});

	it("splits where the wall is not rectangular", () => {
		// An L: the top row is three wide, the row below only one, so the block cannot extend down
		// at full width and the remainder becomes its own box.
		const { cells, width, height } = grid([
			[W, W, W],
			[W, F, F],
		]);

		const rects = mergeWalls(cells, width, height);

		expect(rects).toEqual([
			{ x: 0, y: 0, width: 3, height: 1 },
			{ x: 0, y: 1, width: 1, height: 1 },
		]);
	});

	it("covers exactly the wall cells, never more", () => {
		// Area equality is the invariant worth guarding: too little leaves holes in a wall, too
		// much puts a wall across a doorway.
		const { cells, width, height } = grid([
			[W, W, F, W],
			[W, F, F, W],
			[W, W, W, W],
		]);

		const rects = mergeWalls(cells, width, height);

		expect(area(rects)).toBe(countWallCells(cells));
	});

	it("produces no overlapping rectangles", () => {
		const { cells, width, height } = grid([
			[W, W, W],
			[W, W, F],
			[W, F, F],
		]);

		const covered = new Set<string>();
		for (const rect of mergeWalls(cells, width, height)) {
			for (let dy = 0; dy < rect.height; dy++) {
				for (let dx = 0; dx < rect.width; dx++) {
					const key = `${rect.x + dx},${rect.y + dy}`;
					expect(covered.has(key)).toBe(false);
					covered.add(key);
				}
			}
		}

		expect(covered.size).toBe(countWallCells(cells));
	});

	it("treats segments and floor as not wall", () => {
		// Only 255 is a wall; a room id must never be extruded.
		const { cells, width, height } = grid([[1, 60, PixelType.NEW_SEGMENT, PixelType.UNKNOWN, F]]);

		expect(mergeWalls(cells, width, height)).toEqual([]);
	});

	it("cuts a room's cells down to far fewer boxes than cells", () => {
		// A 20x20 ring of wall: 76 cells. Per-cell extrusion is what this exists to avoid.
		const rows: number[][] = [];
		for (let y = 0; y < 20; y++) {
			rows.push(
				Array.from({ length: 20 }, (_unused, x) => (y === 0 || y === 19 || x === 0 || x === 19 ? W : F)),
			);
		}
		const { cells, width, height } = grid(rows);

		const rects = mergeWalls(cells, width, height);

		expect(area(rects)).toBe(countWallCells(cells));
		expect(rects.length).toBeLessThan(10);
	});
});
