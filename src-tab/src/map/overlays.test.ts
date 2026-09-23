import { describe, expect, it } from "vitest";
import {
	CarpetKind,
	ZONE_STROKE,
	buildOverlays,
	carpetBitmap,
	carpetCells,
	curtainPoints,
	mopMaskBitmap,
	pointInPolygon,
	roomAtWorld,
	zoneRect,
} from "./overlays";
import { furnitureImage } from "./furnitureImages";
import { layoutBadge } from "./roomBadges";
import { PixelType } from "./mapPackage";
import type { MapMeta, MapPackage } from "./mapPackage";

/** A map of 50 mm cells with its origin at 0/0. */
function pkg(cells: number[], width: number, height: number, meta: MapMeta = {}): MapPackage {
	return {
		header: { gridSize: 50, width, height, origin: { x: 0, y: 0 }, robot: null, charger: null, mapId: 1 },
		cells: new Uint8Array(cells),
		meta,
	};
}

describe("zones and lines", () => {
	const header = pkg([], 10, 10).header;

	it("insets a zone by half its outline, so the outline ends on the zone's edge as in Home Assistant", () => {
		// 100..300 mm in x is cells 2..6; y 100..300 mm lands 6..2 cells from the top, minus the
		// world-to-image term's 1 mm.
		const zone = zoneRect([100, 100, 300, 300], header);
		expect(zone.x).toBeCloseTo(2 + ZONE_STROKE / 2);
		expect(zone.width).toBeCloseTo(4 - ZONE_STROKE);
		expect(zone.height).toBeCloseTo(4 - ZONE_STROKE);
	});

	it("draws a curtain as a wave along its line", () => {
		const points = curtainPoints([0, 250, 500, 250], header).split(" ");
		expect(points.length).toBe(41); // 10 cells in quarter steps, both ends included
		const offsets = points.map(point => Number(point.split(",")[1]));
		expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(1);
	});

	it("leaves out what lies in a hidden room", () => {
		const map = pkg([1, 1, 2, 2], 2, 2, {
			ha: {
				noGo: [[0, 0, 40, 40]],
				virtualWalls: [[60, 60, 90, 90]],
				furnitures: [{ x: 10, y: 10, w: 50, h: 50, type: 1, angle: 0, seg: 0 }],
			},
		});
		expect(roomAtWorld(map, 10, 10)).toBe(1);
		const all = buildOverlays(map);
		expect([all.noGo.length, all.virtualWalls.length, all.furniture.length]).toEqual([1, 1, 1]);
		const hidden = buildOverlays(map, new Set([1]));
		expect([hidden.noGo.length, hidden.virtualWalls.length, hidden.furniture.length]).toEqual([0, 1, 0]);
	});

	it("has a picture for the furniture types the widget had, and none for others", () => {
		expect(furnitureImage(1)).toBeTruthy();
		expect(furnitureImage(15)).toBeTruthy();
		expect(furnitureImage(99)).toBeNull();
	});
});

describe("carpets", () => {
	it("tests points against a polygon as Home Assistant does", () => {
		const square = [0, 0, 100, 0, 100, 100, 0, 100];
		expect(pointInPolygon(50, 50, square)).toBe(true);
		expect(pointInPolygon(150, 50, square)).toBe(false);
	});

	it("marks room cells under a detected carpet, and never walls", () => {
		const cells = [1, PixelType.WALL, 1, 1, 1, 1, 1, 1, 1];
		const map = pkg(cells, 3, 3, {
			ha: { detectedCarpets: [{ id: 1, polygon: [-100, -100, 300, -100, 300, 300, -100, 300] }] },
		});
		const carpet = carpetCells(map);
		expect(carpet.get(0)).toBe(CarpetKind.DETECTED);
		expect(carpet.get(4)).toBe(CarpetKind.DETECTED);
		expect(carpet.has(1)).toBe(false); // the wall
		// Home Assistant's scan stops one short of the last column and row; so does this.
		expect(carpet.has(2)).toBe(false);
	});

	it("covers a carpet room wall to wall, adds the user's carpets and takes out the deleted ones", () => {
		const map = pkg([1, 1, 1, 2, 2, 2, 2, 2, 2], 3, 3, {
			seg_inf: { "2": { type: 0, index: 0, roomID: null, nei_id: [], material: 6, direction: null } },
			ha: { carpets: [[0, 0, 50, 50]], deletedCarpets: [[50, 50, 100, 100]] },
		});
		const carpet = carpetCells(map);
		expect(carpet.get(0)).toBe(CarpetKind.USER);
		expect(carpet.get(3)).toBe(CarpetKind.DETECTED);
		expect(carpet.has(4)).toBe(false);
	});

	it("shades the top-left and bottom-right quarter of each carpet cell, flipped like the floor", () => {
		const map = pkg([1, 0, 0, 0], 2, 2);
		const bitmap = carpetBitmap(map, new Map([[0, CarpetKind.USER]]))!;
		expect([bitmap.width, bitmap.height]).toEqual([4, 4]);
		// Cell row 0 is the bottom image row; its quarters are pixels (0,2) and (1,3).
		const alphaAt = (x: number, y: number): number => bitmap.rgba[(y * 4 + x) * 4 + 3]!;
		expect([alphaAt(0, 2), alphaAt(1, 3), alphaAt(1, 2), alphaAt(0, 0)]).toEqual([80, 80, 0, 0]);
	});

	it("draws nothing without carpets", () => {
		expect(carpetBitmap(pkg([1], 1, 1), new Map())).toBeNull();
	});
});

describe("mopMaskBitmap", () => {
	it("lets the mopping band onto room cells only, never walls, floor or hidden rooms", () => {
		const map = pkg([1, PixelType.WALL, PixelType.FLOOR, 2], 2, 2);
		const mask = mopMaskBitmap(map, new Set([2]));
		const opaque = (x: number, y: number): boolean => mask.rgba[(y * 2 + x) * 4 + 3] === 255;
		// Flipped: cell row 0 (room 1, wall) is image row 1.
		expect([opaque(0, 1), opaque(1, 1), opaque(0, 0), opaque(1, 0)]).toEqual([true, false, false, false]);
	});
});

describe("room badges", () => {
	it("lays out suction and water around the badge's centre, as wide as the widget's", () => {
		const layout = layoutBadge({ rooms: new Set([1]), suction: 2, wetness: 16 })!;
		// margin 8 + icon 14 + gap 2 + 1 digit 7 + spacing 8 + icon 14 + gap 2 + 2 digits 14 + margin 8
		expect(layout.width).toBe(77);
		expect(layout.parts.map(part => part.value)).toEqual(["2", "16"]);
		expect(layout.parts[0]!.x).toBe(-77 / 2 + 8);
	});

	it("shows only what the mode uses, and nothing without either", () => {
		expect(layoutBadge({ rooms: new Set(), suction: null, wetness: 5 })!.parts).toHaveLength(1);
		expect(layoutBadge({ rooms: new Set(), suction: null, wetness: null })).toBeNull();
	});
});
