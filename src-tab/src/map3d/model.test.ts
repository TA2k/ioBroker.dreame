import { describe, expect, it } from "vitest";
import { WALL_HEIGHT_MM, buildModel, geometryKey, worldToCell } from "./model";
import { furnitureHeightMm, FurnitureType, DEFAULT_FURNITURE_HEIGHT_MM } from "./furniture3d";
import { PixelType } from "../map/mapPackage";
import type { MapMeta, MapPackage } from "../map/mapPackage";

function pkg(cells: number[], width: number, height: number, meta: MapMeta = {}): MapPackage {
	return {
		header: { gridSize: 50, width, height, origin: { x: 0, y: 0 }, robot: null, charger: null, mapId: 1 },
		cells: new Uint8Array(cells),
		meta,
	};
}

describe("worldToCell", () => {
	it("scales by the grid and shifts by the origin", () => {
		const map = pkg([], 10, 10);

		expect(worldToCell(500, 0, map).x).toBe(10);
	});

	it("uses the same y term as the trail, not the shorter wrong one", () => {
		// (height * gridSize - 1 - y) / gridSize = (10*50 - 1) / 50 = 9.98, not 9.
		expect(worldToCell(0, 0, pkg([], 10, 10)).y).toBeCloseTo(9.98, 5);
	});
});

describe("buildModel", () => {
	const wallRow = (width: number, height: number): number[] =>
		Array.from({ length: width * height }, (_unused, index) =>
			index < width ? PixelType.WALL : PixelType.FLOOR,
		);

	it("converts the wall height from millimetres into cells", () => {
		const model = buildModel(pkg(wallRow(4, 2), 4, 2));

		expect(model.wallHeight).toBe(WALL_HEIGHT_MM / 50);
	});

	it("flips the walls into the same space as the floor texture", () => {
		// The wall fills cell row 0, which is the *bottom* of the grid. After the flip it has to
		// sit at the bottom of the image too - at y = height - 1. A missing flip puts every wall
		// on the mirror image of the floor, which looks plausible and is wrong everywhere.
		const model = buildModel(pkg(wallRow(4, 3), 4, 3));

		expect(model.walls).toHaveLength(1);
		expect(model.walls[0]).toMatchObject({ x: 0, y: 2, width: 4, height: 1 });
	});

	it("carries the floor bitmap, so 3D and 2D show the same floor", () => {
		const model = buildModel(pkg(wallRow(4, 2), 4, 2));

		expect(model.floor.width).toBe(4);
		expect(model.floor.height).toBe(2);
	});

	it("converts furniture footprints into cells and keeps the angle", () => {
		const meta: MapMeta = {
			ha: { furnitures: [{ x: 500, y: 500, w: 1000, h: 2000, type: FurnitureType.DOUBLE_BED, angle: 90, seg: 1 }] },
		};
		const model = buildModel(pkg(wallRow(20, 20), 20, 20, meta));

		expect(model.furniture).toHaveLength(1);
		expect(model.furniture[0]).toMatchObject({ width: 20, depth: 40, angle: 90 });
		expect(model.furniture[0]?.height).toBe(furnitureHeightMm(FurnitureType.DOUBLE_BED) / 50);
	});

	it("drops furniture with no footprint rather than drawing a speck", () => {
		const meta: MapMeta = { ha: { furnitures: [{ x: 0, y: 0, w: 0, h: 0, type: 1, angle: 0, seg: 0 }] } };

		expect(buildModel(pkg(wallRow(4, 4), 4, 4, meta)).furniture).toEqual([]);
	});

	it("turns zones into floor areas with a positive extent", () => {
		// Given in either corner order; the area must come out the same way round either way.
		const meta: MapMeta = { ha: { noGo: [[1000, 1000, 0, 0]] } };
		const area = buildModel(pkg(wallRow(40, 40), 40, 40, meta)).noGoZones[0]!;

		expect(area.width).toBeGreaterThan(0);
		expect(area.depth).toBeGreaterThan(0);
	});

	it("reports no robot where the package carries no position", () => {
		expect(buildModel(pkg(wallRow(4, 4), 4, 4)).robot).toBeNull();
	});

	it("places the robot from the package's own header", () => {
		const map = pkg(wallRow(10, 10), 10, 10, { ha: { robotAngle: 42 } });
		map.header.robot = { x: 250, y: 250 };

		const model = buildModel(map);

		expect(model.robot).toMatchObject({ x: 5, angle: 42 });
	});
});

describe("furnitureHeightMm", () => {
	it("gives a known type its chosen height", () => {
		expect(furnitureHeightMm(FurnitureType.WARDROBE)).toBe(2000);
	});

	it("gives an unknown type a plausible default rather than zero", () => {
		// A new type the app gains shows up as a box of about the right size, not as nothing.
		expect(furnitureHeightMm(999)).toBe(DEFAULT_FURNITURE_HEIGHT_MM);
		expect(furnitureHeightMm(null)).toBe(DEFAULT_FURNITURE_HEIGHT_MM);
	});
});

describe("geometryKey", () => {
	const base = pkg([PixelType.FLOOR], 1, 1);

	it("stays the same when only the path grew", () => {
		const withPath: MapPackage = { ...base, meta: { trpts: [[0, 0, 1]] } };

		expect(geometryKey(withPath)).toBe(geometryKey(base));
	});

	it("stays the same when only the robot moved", () => {
		const moved: MapPackage = { ...base, header: { ...base.header, robot: { x: 10, y: 10 } } };

		expect(geometryKey(moved)).toBe(geometryKey(base));
	});

	it("changes when the grid changes size", () => {
		const bigger = pkg([PixelType.FLOOR, PixelType.FLOOR], 2, 1);

		expect(geometryKey(bigger)).not.toBe(geometryKey(base));
	});

	it("changes when furniture is added", () => {
		const meta: MapMeta = { ha: { furnitures: [{ x: 0, y: 0, w: 1, h: 1, type: 1, angle: 0, seg: 0 }] } };

		expect(geometryKey({ ...base, meta })).not.toBe(geometryKey(base));
	});
});
