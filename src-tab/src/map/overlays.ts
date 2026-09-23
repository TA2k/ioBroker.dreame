/**
 * What the 2D map draws over the floor: zones, virtual walls, curtains, furniture, carpets, and
 * the mask that keeps the mopping band on the floor.
 *
 * All of it is Home Assistant's drawing (`map.py`) as the widget ports it (`www/js/karte/
 * overlays.js` and `merger.js`), including its colours and the small corrections it makes to be
 * pixel-exact against HA's Pillow output. Everything here is geometry and pixels, returned as
 * plain data; the view turns it into SVG and canvases.
 *
 * Every function takes the rooms hidden in this view: what lies in a hidden room is hidden with
 * it, zones and furniture included.
 */

import { isSegment } from "./mapPackage";
import type { DetectedCarpet, Furniture, Line4, MapHeader, MapPackage, Rect4 } from "./mapPackage";
import { worldToImage } from "./trail";

/** Colours of Home Assistant's "Dreame Light" scheme. */
export const OVERLAY_COLOURS = {
	noGoFill: "rgba(177,0,0,0.196)",
	noGoLine: "rgba(199,0,0,0.784)",
	noMopFill: "rgba(170,47,255,0.196)",
	noMopLine: "rgba(153,0,210,0.784)",
	virtualWall: "rgba(199,0,0,0.784)",
	curtain: "rgb(247,123,46)",
} as const;

/**
 * Zone outline width in cells: Home Assistant's border width of 2 at its scale of 4.
 *
 * Pillow draws a polygon's outline inside it; SVG centres it on the edge. Zones are inset by half
 * the width so the outline's outer edge lies exactly on the zone's boundary, as in HA - otherwise
 * every zone looks a quarter cell too large all round.
 */
export const ZONE_STROKE = 0.5;
export const VIRTUAL_WALL_STROKE = 0.6;
export const CURTAIN_STROKE = 0.35;

const NONE: ReadonlySet<number> = new Set();

/** The room at a world position, or 0 outside every room. */
export function roomAtWorld(map: MapPackage, x: number, y: number): number {
	const { gridSize, width, height, origin } = map.header;
	const cx = Math.floor((x - origin.x) / gridSize);
	const cy = Math.floor((y - origin.y) / gridSize);
	if (cx < 0 || cy < 0 || cx >= width || cy >= height) return 0;
	const cell = map.cells[cy * width + cx]!;
	return isSegment(cell) ? cell : 0;
}

function inHiddenRoom(map: MapPackage, x: number, y: number, hidden: ReadonlySet<number>): boolean {
	if (!hidden.size) return false;
	const room = roomAtWorld(map, x, y);
	return room !== 0 && hidden.has(room);
}

export interface ZoneRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** A no-go or no-mop zone as an inset rectangle in image cells. */
export function zoneRect(rect: Rect4, header: MapHeader): ZoneRect {
	const topLeft = worldToImage(Math.min(rect[0], rect[2]), Math.max(rect[1], rect[3]), header);
	const bottomRight = worldToImage(Math.max(rect[0], rect[2]), Math.min(rect[1], rect[3]), header);
	return {
		x: topLeft.x + ZONE_STROKE / 2,
		y: topLeft.y + ZONE_STROKE / 2,
		width: Math.max(0, bottomRight.x - topLeft.x - ZONE_STROKE),
		height: Math.max(0, bottomRight.y - topLeft.y - ZONE_STROKE),
	};
}

export interface ImageLine {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export function imageLine(line: Line4, header: MapHeader): ImageLine {
	const a = worldToImage(line[0], line[1], header);
	const b = worldToImage(line[2], line[3], header);
	return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

/**
 * A curtain as a wave along its line, as the Dreame app draws it.
 *
 * 300 mm wavelength, like Home Assistant's 150 mm zigzag half-step, at half HA's amplitude - the
 * widget's choice, on a user's request.
 *
 * @returns SVG polyline points
 */
export function curtainPoints(line: Line4, header: MapHeader): string {
	const { x1, y1, x2, y2 } = imageLine(line, header);
	const dx = x2 - x1;
	const dy = y2 - y1;
	const length = Math.hypot(dx, dy) || 1;
	const ux = dx / length;
	const uy = dy / length;
	const amplitude = 0.625;
	const period = 300 / header.gridSize;
	const points: string[] = [];
	for (let s = 0; s <= length; s += 0.25) {
		const offset = Math.sin((s / period) * 2 * Math.PI) * amplitude;
		points.push(`${(x1 + ux * s - uy * offset).toFixed(2)},${(y1 + uy * s + ux * offset).toFixed(2)}`);
	}
	return points.join(" ");
}

/** Everything drawn as SVG over the floor, filtered for hidden rooms. */
export interface MapOverlays {
	noGo: ZoneRect[];
	noMop: ZoneRect[];
	virtualWalls: ImageLine[];
	curtains: string[];
	furniture: FurniturePlacement[];
}

export interface FurniturePlacement {
	type: number;
	/** Centre and size in image cells; the angle turns the image about its centre. */
	cx: number;
	cy: number;
	width: number;
	height: number;
	angle: number;
}

export function furniturePlacement(furniture: Furniture, header: MapHeader): FurniturePlacement {
	const centre = worldToImage(furniture.x, furniture.y, header);
	return {
		type: furniture.type,
		cx: centre.x,
		cy: centre.y,
		width: furniture.w / header.gridSize,
		height: furniture.h / header.gridSize,
		angle: furniture.angle || 0,
	};
}

export function buildOverlays(map: MapPackage, hidden: ReadonlySet<number> = NONE): MapOverlays {
	const ha = map.meta.ha ?? {};
	const header = map.header;
	const rectVisible = (r: Rect4): boolean =>
		Array.isArray(r) && r.length >= 4 && !inHiddenRoom(map, (r[0] + r[2]) / 2, (r[1] + r[3]) / 2, hidden);
	const lineVisible = (l: Line4): boolean =>
		Array.isArray(l) && l.length >= 4 && !inHiddenRoom(map, (l[0] + l[2]) / 2, (l[1] + l[3]) / 2, hidden);

	return {
		noGo: (ha.noGo ?? []).filter(rectVisible).map(r => zoneRect(r, header)),
		noMop: (ha.noMop ?? []).filter(rectVisible).map(r => zoneRect(r, header)),
		virtualWalls: (ha.virtualWalls ?? []).filter(lineVisible).map(l => imageLine(l, header)),
		curtains: (ha.curtains ?? []).filter(lineVisible).map(l => curtainPoints(l, header)),
		furniture: (ha.furnitures ?? [])
			// The room a piece is in comes with it where the data says; otherwise it is the one under its centre.
			.filter(f => f.type != null && f.w > 0 && f.h > 0)
			.filter(f => (f.seg ? !hidden.has(f.seg) : !inHiddenRoom(map, f.x, f.y, hidden)))
			.map(f => furniturePlacement(f, header)),
	};
}

// ---- Carpets --------------------------------------------------------------------------------

/** Carpet kinds: detected by the robot, or drawn by the user in the app. */
export const CarpetKind = { DETECTED: 1, USER: 2 } as const;

/** Shading of each kind, Home Assistant's `carpet_color_detected` and `carpet_color`. */
const CARPET_ALPHA: Record<number, number> = { 1: 35, 2: 80 };

/** Floor materials 5 to 7 are carpets: a room of one is carpet wall to wall. */
function isCarpetMaterial(material: unknown): boolean {
	return typeof material === "number" && material > 4 && material < 8;
}

/** Room cells only: 1 to 100 are rooms and their fresh scans, never walls or plain floor. */
function isRoomCell(value: number): boolean {
	return value > 0 && value <= 100;
}

/** Home Assistant's `_check_carpet` polygon test: ray casting, in world coordinates. */
export function pointInPolygon(x: number, y: number, polygon: readonly number[]): boolean {
	let inside = false;
	const n = polygon.length;
	for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
		const sx = polygon[i]!;
		const sy = polygon[i + 1]!;
		const tx = polygon[j]!;
		const ty = polygon[j + 1]!;
		if (sx === x && sy === y && tx === x && ty === y) return true;
		if (sy === ty && sy === y && ((sx > x && tx < x) || (sx < x && tx > x))) return true;
		if ((sy < y && ty >= y) || (sy >= y && ty < y)) {
			const crossing = sx + ((y - sy) * (tx - sx)) / (ty - sy);
			if (crossing === x) return true;
			if (crossing > x) inside = !inside;
		}
	}
	return inside;
}

/** Home Assistant's `_optimize_carpet_pixels`: each carpet pixel spread over 4x3 room cells. */
function optimisedCarpetPixels(map: MapPackage, pixels: readonly number[]): Set<number> {
	const { width, height } = map.header;
	const out = new Set<number>();
	for (const index of pixels) {
		const px = index % width;
		const py = (index - px) / width;
		for (let x = Math.max(0, px - 1); x < Math.min(px + 3, width - 1); x++) {
			for (let y = Math.max(0, py - 1); y < Math.min(py + 2, height - 1); y++) {
				if (isRoomCell(map.cells[y * width + x]!)) out.add(y * width + x);
			}
		}
	}
	return out;
}

/**
 * The carpet cells, as Home Assistant's `render_carpets` builds its `carpet_data`: cell index to
 * kind. The order matters - detected carpets, then carpet rooms, then the user's carpets over
 * them, and finally the carpets the user deleted taken out again.
 */
export function carpetCells(map: MapPackage): Map<number, number> {
	const { width, height, gridSize, origin } = map.header;
	const ha = map.meta.ha ?? {};
	const out = new Map<number, number>();
	const cell = (x: number, y: number): number => map.cells[y * width + x]!;

	// With the origin on the half grid - the lidar shift the adapter carries in the header - HA
	// works the carpet cells out from the full grid (map.py 7744-7749): carpets lie on the cells.
	const mod = (v: number): number => ((v % gridSize) + gridSize) % gridSize;
	let left = origin.x;
	let top = origin.y;
	if (mod(left) !== 0 || mod(top) !== 0) {
		left += gridSize / 2;
		top += gridSize / 2;
	}
	const span = (a: number, b: number, from: number, limit: number): [number, number] => [
		Math.max(0, Math.floor((Math.min(a, b) - from) / gridSize)),
		Math.min(limit - 1, Math.ceil((Math.max(a, b) - from) / gridSize)),
	];

	const pixels = map.meta.carpetPx ?? [];
	const detected: readonly DetectedCarpet[] = ha.detectedCarpets ?? [];
	if (detected.length) {
		let optimised: Set<number> | null = null;
		for (const carpet of detected) {
			const polygon = carpet.polygon;
			if (carpet.hidden || !Array.isArray(polygon) || polygon.length < 6 || polygon.length % 2 !== 0) continue;
			const xs = polygon.filter((_, i) => i % 2 === 0);
			const ys = polygon.filter((_, i) => i % 2 === 1);
			const [x0, x1] = span(Math.min(...xs), Math.max(...xs), left, width);
			const [y0, y1] = span(Math.min(...ys), Math.max(...ys), top, height);
			for (let x = x0; x < x1; x++) {
				for (let y = y0; y < y1; y++) {
					if (!isRoomCell(cell(x, y))) continue;
					// The polygon test itself uses the origin as it is, unshifted (map.py 7783-7785).
					if (!pointInPolygon(x * gridSize + origin.x, y * gridSize + origin.y, polygon)) continue;
					// A large polygon is only trusted where the robot's own carpet pixels agree.
					if (polygon.length > 100 && pixels.length) {
						optimised ??= optimisedCarpetPixels(map, pixels);
						if (!optimised.has(y * width + x)) continue;
					}
					out.set(y * width + x, CarpetKind.DETECTED);
				}
			}
		}
	} else if (pixels.length) {
		for (const index of optimisedCarpetPixels(map, pixels)) out.set(index, CarpetKind.DETECTED);
	}

	for (const [id, info] of Object.entries(map.meta.seg_inf ?? {})) {
		if (!isCarpetMaterial((info as { material?: unknown }).material)) continue;
		const room = Number(id);
		for (let i = 0; i < map.cells.length; i++) if (map.cells[i] === room) out.set(i, CarpetKind.DETECTED);
	}

	for (const rect of ha.carpets ?? []) {
		if (!Array.isArray(rect) || rect.length < 4) continue;
		const [x0, x1] = span(rect[0], rect[2], left, width);
		const [y0, y1] = span(rect[1], rect[3], top, height);
		for (let x = x0; x < x1; x++)
			for (let y = y0; y < y1; y++) if (isRoomCell(cell(x, y))) out.set(y * width + x, CarpetKind.USER);
	}

	for (const rect of ha.deletedCarpets ?? []) {
		if (!Array.isArray(rect) || rect.length < 4) continue;
		const [x0, x1] = span(rect[0], rect[2], left, width);
		const [y0, y1] = span(rect[1], rect[3], top, height);
		for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) out.delete(y * width + x);
	}

	return out;
}

/**
 * The carpet shading at twice the map's resolution: in each carpet cell the top-left and the
 * bottom-right quarter darkened, which makes Home Assistant's checkerboard. Flipped vertically
 * like the floor. Null where there is no carpet to draw.
 */
export function carpetBitmap(
	map: MapPackage,
	cells: ReadonlyMap<number, number>,
	hidden: ReadonlySet<number> = NONE,
): { width: number; height: number; rgba: Uint8ClampedArray<ArrayBuffer> } | null {
	if (!cells.size) return null;
	const { width, height } = map.header;
	const w = width * 2;
	const rgba = new Uint8ClampedArray(new ArrayBuffer(w * height * 2 * 4));
	for (const [index, kind] of cells) {
		const value = map.cells[index]!;
		if (isSegment(value) && hidden.has(value)) continue;
		const x = index % width;
		const y = height - 1 - (index - x) / width;
		const alpha = CARPET_ALPHA[kind] ?? CARPET_ALPHA[CarpetKind.DETECTED]!;
		for (const [dx, dy] of [
			[0, 0],
			[1, 1],
		] as const) {
			const target = ((y * 2 + dy) * w + x * 2 + dx) * 4;
			rgba[target + 3] = alpha; // black, so only the alpha channel needs writing
		}
	}
	return { width: w, height: height * 2, rgba };
}

/**
 * Where the mopping band may be drawn: room cells only, flipped like the floor, opaque white.
 *
 * The band is some ten times as wide as the vacuum line and would spill over walls and furniture.
 * Home Assistant stamps it to the rooms (map.py 9224, 10798-10812) - types 1 to 100, never walls
 * or unassigned floor, and never a hidden room.
 */
export function mopMaskBitmap(
	map: MapPackage,
	hidden: ReadonlySet<number> = NONE,
): { width: number; height: number; rgba: Uint8ClampedArray<ArrayBuffer> } {
	const { width, height } = map.header;
	const rgba = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const value = map.cells[y * width + x]!;
			if (!isRoomCell(value) || (isSegment(value) && hidden.has(value))) continue;
			rgba.fill(255, ((height - 1 - y) * width + x) * 4, ((height - 1 - y) * width + x) * 4 + 4);
		}
	}
	return { width, height, rgba };
}
