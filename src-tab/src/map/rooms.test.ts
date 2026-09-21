import { describe, expect, it } from "vitest";
import { clusterRooms, collectRooms, labelRooms, roomDisplayName } from "./rooms";
import { PixelType } from "./mapPackage";
import type { MapMeta, MapPackage, SegmentInfo } from "./mapPackage";

const segment = (name?: string): SegmentInfo => ({
	type: 0,
	index: 0,
	roomID: null,
	nei_id: [],
	material: null,
	direction: null,
	...(name ? { name: Buffer.from(name, "utf8").toString("base64") } : {}),
});

function pkg(cells: number[], width: number, height: number, meta: MapMeta = {}): MapPackage {
	return {
		header: { gridSize: 50, width, height, origin: { x: 0, y: 0 }, robot: null, charger: null, mapId: 1 },
		cells: new Uint8Array(cells),
		meta,
	};
}

describe("collectRooms", () => {
	it("finds a room and reports its size", () => {
		const map = pkg([1, 1, PixelType.FLOOR, PixelType.FLOOR], 2, 2, { seg_inf: { "1": segment("Küche") } });

		const rooms = collectRooms(map);

		expect(rooms).toHaveLength(1);
		expect(rooms[0]).toMatchObject({ id: 1, customName: "Küche", cellCount: 2 });
	});

	it("reports a room with no custom name as unnamed rather than inventing one", () => {
		const map = pkg([1], 1, 1, { seg_inf: { "1": segment() } });

		expect(collectRooms(map)[0]?.customName).toBeNull();
	});

	it("puts the centroid in image coordinates, matching the flipped floor", () => {
		// Room 1 fills cell row 0 only. After the flip that is the bottom image row, y = 1.
		const map = pkg([1, 1, PixelType.FLOOR, PixelType.FLOOR], 2, 2, { seg_inf: { "1": segment() } });

		expect(collectRooms(map)[0]?.centre).toEqual({ x: 0.5, y: 1 });
	});

	it("reports bounds in the same flipped space", () => {
		const map = pkg([PixelType.FLOOR, PixelType.FLOOR, 1, 1], 2, 2, { seg_inf: { "1": segment() } });

		expect(collectRooms(map)[0]?.bounds).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 0 });
	});

	it("ignores segments the stored room structure does not know", () => {
		// 60 is the kind of provisional number the robot hands out while driving.
		const map = pkg([1, 60], 2, 1, { seg_inf: { "1": segment("Bad") } });

		expect(collectRooms(map).map(room => room.id)).toEqual([1]);
	});

	it("labels nothing at all when there is no stored room structure", () => {
		expect(collectRooms(pkg([1, 2, 3], 3, 1))).toEqual([]);
	});

	it("leaves out rooms hidden in the app", () => {
		const map = pkg([1, 2], 2, 1, {
			seg_inf: { "1": segment("A"), "2": segment("B") },
			ha: { hiddenSegments: [2] },
		});

		expect(collectRooms(map).map(room => room.id)).toEqual([1]);
	});

	it("leaves out rooms hidden in this view", () => {
		const map = pkg([1, 2], 2, 1, { seg_inf: { "1": segment("A"), "2": segment("B") } });

		expect(collectRooms(map, { hiddenLocally: new Set([1]) }).map(room => room.id)).toEqual([2]);
	});

	it("drops specks below the minimum size", () => {
		const map = pkg([1, 1, 1, 2], 4, 1, { seg_inf: { "1": segment("Big"), "2": segment("Speck") } });

		expect(collectRooms(map, { minCells: 2 }).map(room => room.id)).toEqual([1]);
	});

	it("returns the largest room first", () => {
		const map = pkg([2, 1, 1, 1], 4, 1, { seg_inf: { "1": segment("Big"), "2": segment("Small") } });

		expect(collectRooms(map).map(room => room.id)).toEqual([1, 2]);
	});

	it("ignores walls, floor and everything outside", () => {
		const cells = [PixelType.WALL, PixelType.FLOOR, PixelType.OUTSIDE, PixelType.NEW_SEGMENT];
		expect(collectRooms(pkg(cells, 4, 1, { seg_inf: {} }))).toEqual([]);
	});
});

describe("clusterRooms", () => {
	const room = (id: number, minX: number, maxX: number) => ({
		id,
		customName: null,
		type: 0,
		typeIndex: 0,
		centre: { x: (minX + maxX) / 2, y: 0 },
		bounds: { minX, maxX, minY: 0, maxY: 10 },
		cellCount: 100,
	});

	it("keeps neighbouring rooms in one cluster", () => {
		const clusters = clusterRooms([room(1, 0, 10), room(2, 12, 20)], 20);

		expect(clusters).toHaveLength(1);
	});

	it("separates blocks that sit far apart", () => {
		// The case this exists for: two stored maps in one raster, far apart in the same space.
		const clusters = clusterRooms([room(1, 0, 10), room(2, 500, 520)], 20);

		expect(clusters).toHaveLength(2);
		expect(clusters[0]?.map(entry => entry.id)).toEqual([1]);
		expect(clusters[1]?.map(entry => entry.id)).toEqual([2]);
	});

	it("joins a cluster through a room that bridges the gap", () => {
		// 1 and 3 are far apart, but 2 sits between them and links all three.
		const clusters = clusterRooms([room(1, 0, 10), room(3, 60, 70), room(2, 30, 40)], 20);

		expect(clusters).toHaveLength(1);
		expect(clusters[0]).toHaveLength(3);
	});

	it("returns nothing for no rooms", () => {
		expect(clusterRooms([])).toEqual([]);
	});
});

describe("roomDisplayName", () => {
	// The rule is Home Assistant's set_name(); each step and each precedence pair is pinned,
	// because getting the order wrong still produces plausible-looking labels.
	const translate = (type: number): string | null => (type === 6 ? "Bathroom" : null);
	const fallback = (id: number): string => `Room ${id}`;
	const room = (over: Partial<Parameters<typeof roomDisplayName>[0]> = {}) => ({
		id: 7,
		customName: null,
		type: 0,
		typeIndex: 0,
		...over,
	});

	it("uses the translated room type when one was chosen", () => {
		expect(roomDisplayName(room({ type: 6 }), translate, fallback)).toBe("Bathroom");
	});

	it("numbers the second room of a type, and only from the second", () => {
		expect(roomDisplayName(room({ type: 6, typeIndex: 0 }), translate, fallback)).toBe("Bathroom");
		expect(roomDisplayName(room({ type: 6, typeIndex: 1 }), translate, fallback)).toBe("Bathroom 2");
		expect(roomDisplayName(room({ type: 6, typeIndex: 2 }), translate, fallback)).toBe("Bathroom 3");
	});

	it("prefers the room type over a custom name", () => {
		const name = roomDisplayName(room({ type: 6, customName: "Downstairs" }), translate, fallback);

		expect(name).toBe("Bathroom");
	});

	it("never treats type 0 as a type, even if something translates it", () => {
		// Type 0 means "none chosen". Honouring it would label every untyped room identically.
		const eager = (type: number): string | null => (type === 0 ? "Room" : null);

		expect(roomDisplayName(room({ type: 0, customName: "Attic" }), eager, fallback)).toBe("Attic");
	});

	it("falls through to the custom name when the type has no translation", () => {
		expect(roomDisplayName(room({ type: 99, customName: "Attic" }), translate, fallback)).toBe("Attic");
	});

	it("falls through to the id when there is neither type nor name", () => {
		expect(roomDisplayName(room({ id: 7 }), translate, fallback)).toBe("Room 7");
	});
});

describe("labelRooms", () => {
	const room = (over: Partial<Parameters<typeof labelRooms>[0][number]> = {}) => ({
		id: 7,
		customName: null,
		type: 0,
		typeIndex: 0,
		centre: { x: 0, y: 0 },
		bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
		cellCount: 10,
		...over,
	});

	// One naming rule, applied once above both views: the 2D labels, the 3D sprites and anything
	// else that names a room must agree, and a second copy of the rule is a second chance to drift.
	const translate = (key: string, ...args: string[]): string => {
		if (key === "room.type.6") return "Bathroom";
		if (key === "room.fallback") return `Room ${args[0]}`;
		// The real I18n returns the key when nothing is translated, which is the fall-through signal.
		return key;
	};

	it("gives every room a label", () => {
		const labelled = labelRooms([room(), room({ id: 2, customName: "Attic" })], translate);

		expect(labelled.map(entry => entry.label)).toEqual(["Room 7", "Attic"]);
	});

	it("uses the translated room type where one is set", () => {
		expect(labelRooms([room({ type: 6 })], translate)[0]?.label).toBe("Bathroom");
	});

	it("keeps the rest of the room untouched", () => {
		const labelled = labelRooms([room({ cellCount: 42 })], translate)[0]!;

		expect(labelled.cellCount).toBe(42);
		expect(labelled.centre).toEqual({ x: 0, y: 0 });
	});
});
