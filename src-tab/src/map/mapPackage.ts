/**
 * Decodes the map package the adapter publishes as `dreame.<instance>.<did>.map.mergedCloud`.
 *
 * ## The format
 *
 * The state holds a JSON string, not the map itself: `{ mapstr: [{ map: "<base64>" }] }`. That
 * base64, inflated, is three parts in one buffer, written by `lib/mapMerge.js` (`toWire`):
 *
 * | part   | size       | content                                                        |
 * | ------ | ---------- | -------------------------------------------------------------- |
 * | header | 27 bytes   | grid size, dimensions, world origin, robot position            |
 * | cells  | `w * h`    | one byte per cell: a {@link PixelType} or a segment id          |
 * | meta   | rest       | UTF-8 JSON: rooms, furniture, zones, carpets, path              |
 *
 * ## Why this is its own module
 *
 * Everything drawn - the 2D floor, the 3D walls, the room labels, the furniture - comes out of
 * this one package, so the decode belongs in one place that knows nothing about how any of it is
 * drawn. It is also the only part of the pipeline that can be tested without a canvas, a WebGL
 * context or a socket, which is why it is a plain function over a string rather than a method on
 * a view.
 *
 * The logic is ported from the existing widget (`www/js/karte/merger.js`, `decode`), which stays
 * as it is; this is a translation into typed, isolated form, not a change of behaviour. Identifier
 * and comment language differs from that file on purpose - new code in this project is English.
 */

/** Size of the fixed-length header, in bytes. Cell data starts here. */
export const MAP_HEADER_SIZE = 27;

/**
 * Cell values that are not segment ids.
 *
 * Mirrors `MapPixelType` in `lib/haMap.js`, which is itself a port of the Home Assistant
 * integration's `types.py`. Only the values the drawing code distinguishes are listed; any other
 * byte is a segment id, i.e. a room.
 */
export const PixelType = {
	OUTSIDE: 0,
	UNKNOWN: 252,
	NEW_SEGMENT: 253,
	FLOOR: 254,
	WALL: 255,
} as const;

/**
 * The robot reports this in both axes when it has no position fix.
 *
 * It is `Int16` max, not a coordinate, and has to be filtered out before the value reaches
 * anything that would otherwise place the robot 32 metres off the map.
 */
const NO_POSITION = 32767;

/** A point in world coordinates, in millimetres. */
export interface WorldPoint {
	x: number;
	y: number;
}

/** The fixed-length part of the package. */
export interface MapHeader {
	/** Edge length of one cell in millimetres. */
	gridSize: number;
	/** Grid width in cells. */
	width: number;
	/** Grid height in cells. */
	height: number;
	/** World coordinates of the grid's origin, in millimetres. */
	origin: WorldPoint;
	/**
	 * Robot position carried by this very package, or null where it has no fix.
	 *
	 * Deliberately preferred over the separate `map.robot` state: this one belongs to the same
	 * package as the path, so it can never be a frame out of step with the trail drawn from it.
	 * The separate state arrives on its own schedule and in no fixed order relative to the map.
	 */
	robot: WorldPoint | null;
	/** Dock position carried by the package, or null where the map has none. */
	charger: WorldPoint | null;
	/**
	 * Which stored map this package is, as the robot numbers them.
	 *
	 * This is how a view knows which floor the live data belongs to. The alternative,
	 * `remote.custom-room-cleaning.active-map`, is a user's choice for room cleaning and can point at
	 * a different floor from the one the robot is standing on.
	 */
	mapId: number;
}

/** One piece of furniture, as the map reports it. */
export interface Furniture {
	/** Centre in world coordinates, in millimetres. */
	x: number;
	y: number;
	/** Footprint in millimetres. */
	w: number;
	h: number;
	/** `FurnitureType` from `lib/haMap.js`; 1..31 with gaps. */
	type: number;
	/** Rotation in degrees. */
	angle: number;
	/** Segment the piece stands in, or 0 where unassigned. */
	seg: number;
}

/** A room as the stored map structure describes it. */
export interface SegmentInfo {
	type: number;
	index: number;
	/** Room id as the robot knows it, or null. */
	roomID: number | null;
	/** Neighbouring segment ids. */
	nei_id: number[];
	/** Floor material and its laying direction, where the model reports them. */
	material: number | null;
	direction: number | null;
	/** Custom room name, base64-encoded UTF-8. Absent where the room is unnamed. */
	name?: string;
}

/** A carpet the robot detected, as a polygon rather than a rectangle. */
export interface DetectedCarpet {
	id: number;
	/** Flat `[x0, y0, x1, y1, ...]`, at least three points. */
	polygon: number[];
	hidden?: boolean;
}

/** An axis-aligned area: `[x0, y0, x2, y2]`. */
export type Rect4 = [number, number, number, number];

/** A line segment: `[x0, y0, x1, y1]`. */
export type Line4 = [number, number, number, number];

/**
 * One point of the driven path.
 *
 * The third element is the path type: `0` continues the current run, `1` vacuuming, `2` vacuuming
 * and mopping, `3` mopping. A run break is any non-zero value, which is why `0` has to keep
 * meaning "continuation" - older drawing code tests `!== 0` and nothing else.
 */
export type PathPoint = [number, number, number];

/** The `ha` block of the meta JSON: everything the Home Assistant port carries across. */
export interface MapMetaHa {
	colorIndex?: Record<string, number>;
	hiddenSegments?: number[];
	furnitures?: Furniture[];
	curtains?: Line4[];
	virtualWalls?: Line4[];
	noGo?: Rect4[];
	noMop?: Rect4[];
	carpets?: Rect4[];
	deletedCarpets?: Rect4[];
	detectedCarpets?: DetectedCarpet[];
	robotAngle?: number;
	/** Segments belonging to the job currently running. */
	activeSegments?: number[];
	zoneCleaning?: boolean;
	walls?: unknown;
	doors?: unknown;
	ramps?: Rect4[];
	cliffs?: Line4[];
	virtualThresholds?: Line4[];
	passableThresholds?: Line4[];
	impassableThresholds?: Line4[];
	robotSegment?: number | null;
	stationSegment?: number | null;
}

/** The meta JSON that follows the cell data. */
export interface MapMeta {
	seg_inf?: Record<string, SegmentInfo>;
	ha?: MapMetaHa;
	trpts?: PathPoint[];
	/** Carpet cells as flat grid indices (`y * width + x`). */
	carpetPx?: number[];
}

/** A decoded package, ready to draw from. */
export interface MapPackage {
	header: MapHeader;
	/** One byte per cell, row-major, `width * height` long. */
	cells: Uint8Array;
	meta: MapMeta;
}

/** Thrown where the state value cannot be read as a map package at all. */
export class MapPackageError extends Error {
	public constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "MapPackageError";
	}
}

/**
 * Pulls the base64 payload out of the state's JSON wrapper.
 *
 * Strips a trailing `,...` where one is present. Some models append further comma-separated
 * fields after the map, and feeding those to the base64 decoder yields a buffer that inflates to
 * nothing - the comma-truncation bug fixed adapter-side in 0.4.3 and guarded here as well,
 * because a payload from an older adapter can still arrive.
 *
 * The guard is deliberately narrow: it only cuts where the part before the comma is long and
 * looks like base64, so a short or non-base64 leading field is left alone to fail loudly further
 * down rather than being silently truncated into a plausible-looking buffer.
 */
export function extractBase64(stateValue: string): string {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stateValue);
	} catch (cause) {
		throw new MapPackageError("mergedCloud is not valid JSON", { cause });
	}

	const mapstr = (parsed as { mapstr?: unknown })?.mapstr;
	if (!Array.isArray(mapstr) || mapstr.length === 0) {
		throw new MapPackageError("mergedCloud carries no mapstr entry");
	}

	const raw = (mapstr[0] as { map?: unknown })?.map;
	if (typeof raw !== "string" || raw.length === 0) {
		throw new MapPackageError("mergedCloud mapstr entry carries no map string");
	}

	const comma = raw.indexOf(",");
	if (comma > 100 && /^[A-Za-z0-9+/_-]+$/.test(raw.slice(0, comma))) {
		return raw.slice(0, comma);
	}
	return raw;
}

/** Turns a base64 string into bytes. */
export function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

/**
 * Inflates a deflate stream.
 *
 * Uses the platform's `DecompressionStream` rather than a bundled inflate: it is present in every
 * browser the admin supports and in Node 18 and up, so the tab ships no compression code of its
 * own and the test run uses the same implementation the browser will.
 *
 * The source is a `ReadableStream` built by hand rather than `new Blob([bytes]).stream()`, which
 * is what the existing widget uses. Both work in a browser, but jsdom's Blob has no `stream`, and
 * a decoder that cannot be exercised under test is a decoder nobody checks.
 */
export async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
	const source = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(bytes);
			controller.close();
		},
	});
	// The cast bridges two lib definitions: `DecompressionStream` declares its writable side as
	// `BufferSource`, while a `ReadableStream<Uint8Array>` offers exactly that but says so more
	// narrowly. Nothing unsafe passes through it - only `Uint8Array` is ever enqueued above.
	const inflated = source.pipeThrough(new DecompressionStream("deflate") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
	return new Uint8Array(await new Response(inflated).arrayBuffer());
}

/**
 * Reads the header out of an inflated buffer.
 *
 * Offsets are fixed by `lib/mapMerge.js` (`readHeader`) and every value is little-endian `Int16`.
 */
export function readHeader(buffer: Uint8Array): MapHeader {
	if (buffer.byteLength < MAP_HEADER_SIZE) {
		throw new MapPackageError(`map buffer is shorter than its header (${buffer.byteLength} bytes)`);
	}

	const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	const point = (xOffset: number, yOffset: number): WorldPoint | null => {
		const x = view.getInt16(xOffset, true);
		const y = view.getInt16(yOffset, true);
		return x === NO_POSITION && y === NO_POSITION ? null : { x, y };
	};

	return {
		// Offset 0 is the map id, written by `lib/mapMerge.js` (`toWire`) as the first header field.
		mapId: view.getInt16(0, true),
		gridSize: view.getInt16(17, true),
		width: view.getInt16(19, true),
		height: view.getInt16(21, true),
		origin: { x: view.getInt16(23, true), y: view.getInt16(25, true) },
		robot: point(5, 7),
		// Same "no fix" convention as the robot: 32767 in both axes means the map has no dock.
		charger: point(11, 13),
	};
}

/**
 * Decodes a `mergedCloud` state value into cells and meta.
 *
 * A malformed meta block is tolerated and yields `{}`: the meta is a bag of optional extras, and
 * losing the furniture is no reason to lose the floor. A malformed header or a cell count that
 * does not match the dimensions is not tolerated - everything downstream indexes into the grid by
 * those numbers, so a wrong one would read neighbouring rooms' cells rather than fail.
 */
export async function decodeMapPackage(stateValue: string): Promise<MapPackage> {
	const buffer = await inflate(base64ToBytes(extractBase64(stateValue)));
	const header = readHeader(buffer);

	if (header.width <= 0 || header.height <= 0) {
		throw new MapPackageError(`map has no area (${header.width}x${header.height} cells)`);
	}

	const cellCount = header.width * header.height;
	const cellsEnd = MAP_HEADER_SIZE + cellCount;
	if (buffer.byteLength < cellsEnd) {
		throw new MapPackageError(
			`map buffer holds ${buffer.byteLength - MAP_HEADER_SIZE} cells, header promises ${cellCount}`,
		);
	}

	const cells = buffer.subarray(MAP_HEADER_SIZE, cellsEnd);

	let meta: MapMeta = {};
	if (buffer.byteLength > cellsEnd) {
		try {
			meta = JSON.parse(new TextDecoder().decode(buffer.subarray(cellsEnd))) as MapMeta;
		} catch {
			// Deliberately swallowed, see the note above: the floor survives a broken meta block.
			meta = {};
		}
	}

	return { header, cells, meta };
}

/** True where the cell value is a room rather than a wall, floor or marker. */
export function isSegment(cell: number): boolean {
	return cell !== PixelType.OUTSIDE && cell < PixelType.UNKNOWN;
}

/** Decodes a room's custom name, or returns null where it has none or the name is malformed. */
export function segmentName(segment: SegmentInfo | undefined): string | null {
	if (!segment?.name) return null;
	try {
		return new TextDecoder().decode(base64ToBytes(segment.name));
	} catch {
		return null;
	}
}
