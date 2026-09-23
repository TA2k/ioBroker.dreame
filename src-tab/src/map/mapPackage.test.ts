import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
	MAP_HEADER_SIZE,
	MapPackageError,
	PixelType,
	base64ToBytes,
	decodeMapPackage,
	extractBase64,
	isSegment,
	readHeader,
	segmentName,
} from "./mapPackage";
import type { MapMeta } from "./mapPackage";

/**
 * Builds a package in the exact shape `lib/mapMerge.js` writes.
 *
 * Header offsets are hard-coded here on purpose rather than imported from the module under test:
 * a test that reads the layout from the same constant it is checking would keep passing if the
 * layout silently changed.
 */
function buildPackage(options: {
	gridSize?: number;
	width: number;
	height: number;
	origin?: { x: number; y: number };
	robot?: { x: number; y: number } | null;
	charger?: { x: number; y: number } | null;
	mapId?: number;
	cells?: Uint8Array;
	meta?: MapMeta | string;
	omitMeta?: boolean;
}): string {
	const { width, height } = options;
	const gridSize = options.gridSize ?? 50;
	const origin = options.origin ?? { x: -1000, y: -2000 };
	const robot = options.robot === undefined ? { x: 120, y: -340 } : options.robot;
	const charger = options.charger === undefined ? { x: -60, y: 80 } : options.charger;

	const header = Buffer.alloc(MAP_HEADER_SIZE);
	header.writeInt16LE(options.mapId ?? 3, 0);
	header.writeInt16LE(charger === null ? 32767 : charger.x, 11);
	header.writeInt16LE(charger === null ? 32767 : charger.y, 13);
	header.writeInt16LE(robot === null ? 32767 : robot.x, 5);
	header.writeInt16LE(robot === null ? 32767 : robot.y, 7);
	header.writeInt16LE(gridSize, 17);
	header.writeInt16LE(width, 19);
	header.writeInt16LE(height, 21);
	header.writeInt16LE(origin.x, 23);
	header.writeInt16LE(origin.y, 25);

	const cells = options.cells ?? new Uint8Array(Math.max(0, width * height));
	const parts: Buffer[] = [header, Buffer.from(cells)];
	if (!options.omitMeta) {
		const meta = typeof options.meta === "string" ? options.meta : JSON.stringify(options.meta ?? {});
		parts.push(Buffer.from(meta, "utf8"));
	}

	const base64 = deflateSync(Buffer.concat(parts)).toString("base64");
	return JSON.stringify({ mapstr: [{ map: base64 }] });
}

describe("extractBase64", () => {
	it("reads the payload out of the state wrapper", () => {
		expect(extractBase64(JSON.stringify({ mapstr: [{ map: "AAAA" }] }))).toBe("AAAA");
	});

	it("cuts a trailing comma field off a long base64 payload", () => {
		const payload = "A".repeat(200);
		const value = JSON.stringify({ mapstr: [{ map: `${payload},extra,fields` }] });

		expect(extractBase64(value)).toBe(payload);
	});

	it("leaves a short leading field alone rather than truncating to it", () => {
		// Below the length threshold, so cutting here would produce a plausible but wrong buffer.
		const value = JSON.stringify({ mapstr: [{ map: "AAAA,BBBB" }] });

		expect(extractBase64(value)).toBe("AAAA,BBBB");
	});

	it("leaves a long leading field alone when it is not base64", () => {
		const value = JSON.stringify({ mapstr: [{ map: `${"!".repeat(200)},rest` }] });

		expect(extractBase64(value)).toContain("!");
	});

	it("rejects values that carry no map", () => {
		expect(() => extractBase64("not json")).toThrow(MapPackageError);
		expect(() => extractBase64(JSON.stringify({}))).toThrow(MapPackageError);
		expect(() => extractBase64(JSON.stringify({ mapstr: [] }))).toThrow(MapPackageError);
		expect(() => extractBase64(JSON.stringify({ mapstr: [{}] }))).toThrow(MapPackageError);
	});
});

describe("readHeader", () => {
	it("reads dimensions, grid size and origin", async () => {
		const value = buildPackage({ width: 4, height: 3, gridSize: 50, origin: { x: -1000, y: -2000 } });
		const { header } = await decodeMapPackage(value);

		expect(header).toEqual({
			gridSize: 50,
			width: 4,
			height: 3,
			origin: { x: -1000, y: -2000 },
			robot: { x: 120, y: -340 },
			charger: { x: -60, y: 80 },
			mapId: 3,
		});
	});

	it("reads a negative robot coordinate rather than a huge positive one", async () => {
		const value = buildPackage({ width: 2, height: 2, robot: { x: -5000, y: -7000 } });
		const { header } = await decodeMapPackage(value);

		expect(header.robot).toEqual({ x: -5000, y: -7000 });
	});

	it("reports no robot position where the robot has no fix", async () => {
		const value = buildPackage({ width: 2, height: 2, robot: null });
		const { header } = await decodeMapPackage(value);

		expect(header.robot).toBeNull();
	});

	it("refuses a buffer shorter than the header", () => {
		expect(() => readHeader(new Uint8Array(10))).toThrow(MapPackageError);
	});
});

describe("decodeMapPackage", () => {
	it("returns exactly width * height cells", async () => {
		const cells = new Uint8Array(4 * 3).fill(PixelType.FLOOR);
		const { cells: decoded } = await decodeMapPackage(buildPackage({ width: 4, height: 3, cells }));

		expect(decoded).toHaveLength(12);
		expect(Array.from(decoded)).toEqual(Array.from(cells));
	});

	it("keeps cell values byte for byte, including wall and segment ids", async () => {
		const cells = new Uint8Array([PixelType.WALL, 1, 2, PixelType.OUTSIDE]);
		const { cells: decoded } = await decodeMapPackage(buildPackage({ width: 2, height: 2, cells }));

		expect(Array.from(decoded)).toEqual([255, 1, 2, 0]);
	});

	it("reads the meta block", async () => {
		const meta: MapMeta = {
			seg_inf: { "1": { type: 0, index: 0, roomID: 7, nei_id: [2], material: null, direction: null } },
			ha: { furnitures: [{ x: 10, y: 20, w: 500, h: 400, type: 5, angle: 90, seg: 1 }] },
			trpts: [
				[0, 0, 1],
				[10, 10, 0],
			],
			carpetPx: [3, 4],
		};
		const { meta: decoded } = await decodeMapPackage(buildPackage({ width: 2, height: 2, meta }));

		expect(decoded.ha?.furnitures?.[0]).toEqual({ x: 10, y: 20, w: 500, h: 400, type: 5, angle: 90, seg: 1 });
		expect(decoded.trpts).toHaveLength(2);
		expect(decoded.carpetPx).toEqual([3, 4]);
	});

	it("survives a broken meta block, because the floor does not depend on it", async () => {
		const value = buildPackage({ width: 2, height: 2, meta: "{not valid json" });
		const decoded = await decodeMapPackage(value);

		expect(decoded.meta).toEqual({});
		expect(decoded.cells).toHaveLength(4);
	});

	it("handles a package with no meta block at all", async () => {
		const decoded = await decodeMapPackage(buildPackage({ width: 2, height: 2, omitMeta: true }));

		expect(decoded.meta).toEqual({});
	});

	it("refuses a map with no area rather than yielding an empty grid", async () => {
		await expect(decodeMapPackage(buildPackage({ width: 0, height: 0 }))).rejects.toThrow(MapPackageError);
	});

	it("refuses a buffer holding fewer cells than the header promises", async () => {
		// The header says 4x4, the body carries 4 cells: indexing by the header would read meta
		// bytes as if they were floor.
		const value = buildPackage({ width: 4, height: 4, cells: new Uint8Array(4), omitMeta: true });

		await expect(decodeMapPackage(value)).rejects.toThrow(/promises/);
	});
});

describe("isSegment", () => {
	it("treats room ids as segments", () => {
		expect(isSegment(1)).toBe(true);
		expect(isSegment(60)).toBe(true);
		expect(isSegment(251)).toBe(true);
	});

	it("treats markers, floor, wall and outside as anything but a segment", () => {
		expect(isSegment(PixelType.OUTSIDE)).toBe(false);
		expect(isSegment(PixelType.UNKNOWN)).toBe(false);
		expect(isSegment(PixelType.NEW_SEGMENT)).toBe(false);
		expect(isSegment(PixelType.FLOOR)).toBe(false);
		expect(isSegment(PixelType.WALL)).toBe(false);
	});
});

describe("segmentName", () => {
	const base = { type: 0, index: 0, roomID: null, nei_id: [], material: null, direction: null };

	it("decodes a base64 UTF-8 room name", () => {
		const name = Buffer.from("Küche", "utf8").toString("base64");

		expect(segmentName({ ...base, name })).toBe("Küche");
	});

	it("returns null for a room with no name", () => {
		expect(segmentName({ ...base })).toBeNull();
		expect(segmentName(undefined)).toBeNull();
	});
});

describe("base64ToBytes", () => {
	it("round-trips bytes", () => {
		const bytes = base64ToBytes(Buffer.from([0, 1, 254, 255]).toString("base64"));

		expect(Array.from(bytes)).toEqual([0, 1, 254, 255]);
	});
});

describe("readHeader: map id and dock", () => {
	it("reads the map id, which is how a view knows which floor the live data is", async () => {
		const { header } = await decodeMapPackage(buildPackage({ width: 2, height: 2, mapId: 53 }));

		expect(header.mapId).toBe(53);
	});

	it("reads the dock position from the package itself", async () => {
		const { header } = await decodeMapPackage(buildPackage({ width: 2, height: 2, charger: { x: -800, y: 1200 } }));

		expect(header.charger).toEqual({ x: -800, y: 1200 });
	});

	it("reports no dock where the map has none", async () => {
		const { header } = await decodeMapPackage(buildPackage({ width: 2, height: 2, charger: null }));

		expect(header.charger).toBeNull();
	});
});
