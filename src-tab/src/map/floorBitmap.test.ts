import { describe, expect, it } from "vitest";
import { SCHEME, SEGMENT_COLOURS, cellColour, labelColour, mix, renderFloor, rgbCss, segmentGroup } from "./floorBitmap";
import { PixelType } from "./mapPackage";
import type { MapMeta, MapPackage } from "./mapPackage";

function pkg(cells: number[], width: number, height: number, meta: MapMeta = {}): MapPackage {
	return {
		header: { gridSize: 50, width, height, origin: { x: 0, y: 0 }, robot: null, charger: null, mapId: 1 },
		cells: new Uint8Array(cells),
		meta,
	};
}

/** Reads one pixel of the result as `[r, g, b, a]`. */
function pixelAt(bitmap: { width: number; rgba: Uint8ClampedArray }, x: number, y: number): number[] {
	const offset = (y * bitmap.width + x) * 4;
	return Array.from(bitmap.rgba.slice(offset, offset + 4));
}

const baseContext = {
	knownRooms: null,
	hiddenInApp: new Set<number>(),
	hiddenLocally: new Set<number>(),
	activeSegments: new Set<number>(),
	zoneCleaning: false,
	colourIndex: undefined,
};

describe("cellColour", () => {
	it("paints walls, floor and fresh scans in their own colours", () => {
		expect(cellColour(PixelType.WALL, baseContext)).toEqual(SCHEME.wall);
		expect(cellColour(PixelType.FLOOR, baseContext)).toEqual(SCHEME.floor);
		expect(cellColour(PixelType.NEW_SEGMENT, baseContext)).toEqual(SCHEME.newSegment);
	});

	it("paints unknown as floor, the way Home Assistant does", () => {
		expect(cellColour(PixelType.UNKNOWN, baseContext)).toEqual(SCHEME.floor);
	});

	it("draws nothing outside the map", () => {
		expect(cellColour(PixelType.OUTSIDE, baseContext)).toBeNull();
	});

	it("gives a plain room its group colour", () => {
		expect(cellColour(1, baseContext)).toEqual(SEGMENT_COLOURS[0]![0]);
	});

	// The branch order is the part that is easy to break and invisible when broken, so each
	// precedence pair is pinned separately.
	it("lets hidden-in-app win over a room being outside the running job", () => {
		const colour = cellColour(5, {
			...baseContext,
			hiddenInApp: new Set([5]),
			activeSegments: new Set([9]),
		});

		expect(colour).toEqual(SCHEME.hiddenSegment);
	});

	it("lets an unknown segment win over the running job", () => {
		const colour = cellColour(5, {
			...baseContext,
			knownRooms: new Set([1, 2]),
			activeSegments: new Set([9]),
		});

		expect(colour).toEqual(SCHEME.newSegment);
	});

	it("lets hidden-in-app win over an unknown segment", () => {
		const colour = cellColour(5, {
			...baseContext,
			knownRooms: new Set([1]),
			hiddenInApp: new Set([5]),
		});

		expect(colour).toEqual(SCHEME.hiddenSegment);
	});

	it("greys out rooms outside a running job and keeps those inside it", () => {
		const context = { ...baseContext, activeSegments: new Set([1]) };

		expect(cellColour(1, context)).toEqual(SEGMENT_COLOURS[0]![0]);
		expect(cellColour(2, context)).toEqual(SCHEME.passiveSegment);
	});

	it("drops room colouring entirely during zone cleaning", () => {
		const colour = cellColour(1, { ...baseContext, zoneCleaning: true, activeSegments: new Set([1]) });

		expect(colour).toEqual(SCHEME.newSegment);
	});

	it("treats every segment as known when there is no stored room structure", () => {
		expect(cellColour(42, { ...baseContext, knownRooms: null })).toEqual(segmentGroup(42, undefined)[0]);
	});

	it("draws nothing for a room hidden in this view", () => {
		expect(cellColour(3, { ...baseContext, hiddenLocally: new Set([3]) })).toBeNull();
	});
});

describe("segmentGroup", () => {
	it("uses the adapter's colour index where there is one", () => {
		expect(segmentGroup(1, { "1": 3 })).toBe(SEGMENT_COLOURS[3]);
	});

	it("falls back to the room id when no index was sent", () => {
		expect(segmentGroup(1, undefined)).toBe(SEGMENT_COLOURS[0]);
		expect(segmentGroup(3, undefined)).toBe(SEGMENT_COLOURS[2]);
	});

	it("wraps around rather than running off the palette", () => {
		expect(segmentGroup(9, undefined)).toBe(SEGMENT_COLOURS[0]);
		expect(segmentGroup(60, { "60": 11 })).toBe(SEGMENT_COLOURS[3]);
	});
});

describe("renderFloor", () => {
	it("produces a buffer of the map's size", () => {
		const bitmap = renderFloor(pkg(new Array(6).fill(PixelType.FLOOR), 3, 2));

		expect(bitmap.width).toBe(3);
		expect(bitmap.height).toBe(2);
		expect(bitmap.rgba).toHaveLength(3 * 2 * 4);
	});

	it("flips the grid vertically, because world Y points the other way", () => {
		// Cell row 0 is floor, cell row 1 is wall. In the image the floor has to end up at the
		// bottom; a missing flip would put the robot's map upside down against its position.
		const cells = [PixelType.FLOOR, PixelType.FLOOR, PixelType.WALL, PixelType.WALL];
		const bitmap = renderFloor(pkg(cells, 2, 2));

		expect(pixelAt(bitmap, 0, 0)).toEqual([...SCHEME.wall, 255]);
		expect(pixelAt(bitmap, 0, 1)).toEqual([...SCHEME.floor, 255]);
	});

	it("leaves cells outside the map fully transparent", () => {
		const bitmap = renderFloor(pkg([PixelType.OUTSIDE], 1, 1));

		expect(pixelAt(bitmap, 0, 0)).toEqual([0, 0, 0, 0]);
	});

	it("reads hidden and active segments out of the meta block", () => {
		const meta: MapMeta = { ha: { hiddenSegments: [1], activeSegments: [2] } };
		const bitmap = renderFloor(pkg([1, 2, 3, PixelType.FLOOR], 2, 2, meta));

		// Cell row 0 is image row 1 after the flip.
		expect(pixelAt(bitmap, 0, 1)).toEqual([...SCHEME.hiddenSegment, 255]);
		expect(pixelAt(bitmap, 1, 1)).toEqual([...SEGMENT_COLOURS[1]![0], 255]);
		expect(pixelAt(bitmap, 0, 0)).toEqual([...SCHEME.passiveSegment, 255]);
	});

	it("keeps walls when nothing is hidden, even with the orphan guard on", () => {
		const cells = [PixelType.WALL, 1, 1, 1];
		const bitmap = renderFloor(pkg(cells, 2, 2), { hideOrphanedWalls: true });

		expect(pixelAt(bitmap, 0, 1)).toEqual([...SCHEME.wall, 255]);
	});

	it("drops a wall whose only neighbours are hidden rooms", () => {
		// A 5x1 strip: wall at one end, hidden room filling the rest, so nothing visible is within
		// two cells of the wall.
		const cells = [PixelType.WALL, 7, 7, 7, 7];
		const bitmap = renderFloor(pkg(cells, 5, 1), {
			hiddenLocally: new Set([7]),
			hideOrphanedWalls: true,
		});

		expect(pixelAt(bitmap, 0, 0)).toEqual([0, 0, 0, 0]);
	});

	it("keeps a wall that still borders a visible room", () => {
		// Room 3 sits two cells from the wall, i.e. at the edge of the neighbourhood radius.
		const cells = [PixelType.WALL, 7, 3, 7, 7];
		const bitmap = renderFloor(pkg(cells, 5, 1), {
			hiddenLocally: new Set([7]),
			hideOrphanedWalls: true,
		});

		expect(pixelAt(bitmap, 0, 0)).toEqual([...SCHEME.wall, 255]);
	});
});

describe("mix / rgbCss / labelColour", () => {
	it("keeps the source colour at factor 0 and reaches the target at 1", () => {
		expect(mix([10, 20, 30], [110, 120, 130], 0)).toEqual([10, 20, 30]);
		expect(mix([10, 20, 30], [110, 120, 130], 1)).toEqual([110, 120, 130]);
	});

	it("lands halfway at factor 0.5, rounding to whole channels", () => {
		expect(mix([0, 0, 0], [255, 255, 255], 0.5)).toEqual([128, 128, 128]);
	});

	it("formats a colour for CSS", () => {
		expect(rgbCss([1, 2, 3])).toBe("rgb(1,2,3)");
	});

	it("darkens a room's strong colour for its label, keeping the hue recognisable", () => {
		// Room 1 without an index falls into group 0, whose strong colour is [121,170,255].
		// Taken 60% to black: [48,68,102] - still blue, dark enough to read on the pale fill.
		expect(labelColour(1, undefined)).toBe("rgb(48,68,102)");
	});

	it("follows the adapter's colour index rather than the room id", () => {
		expect(labelColour(1, { "1": 1 })).toBe(rgbCss(mix(SEGMENT_COLOURS[1]![1], [0, 0, 0], 0.6)));
	});
});
