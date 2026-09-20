/**
 * Turns decoded cells into floor pixels.
 *
 * ## Why this is a pure function
 *
 * The same pixels feed two very different things: the 2D view paints them onto a canvas, and the
 * 3D view hands them to three.js as the texture the floor is covered with. Neither needs a canvas
 * to *produce* them, so this module produces none - it returns a plain RGBA buffer, which makes
 * the whole colour scheme testable without a DOM, a WebGL context or a screenshot comparison.
 *
 * ## Faithfulness to Home Assistant
 *
 * The colours and, more importantly, the **order the branches are tried in** are ported from the
 * existing widget (`www/js/karte/merger.js`, `drawFills`), which in turn follows the Home
 * Assistant integration's `map.py`. The order is not cosmetic: a room can be hidden *and* outside
 * the running job at once, and which of the two wins decides what the user sees. Changing the
 * order would silently change the picture, so it is spelled out in {@link cellColour} rather than
 * collapsed into something shorter.
 *
 * ## Not yet ported
 *
 * Carpet shading and the "what changed since the snapshot" overlay both exist in the widget and
 * are absent here. They are drawn on top of these pixels rather than baked into them, so they
 * belong to whichever view wants them, not to this buffer.
 */

import { PixelType, isSegment } from "./mapPackage";
import type { MapPackage } from "./mapPackage";

/** An RGB triple, 0..255. */
export type Rgb = readonly [number, number, number];

/**
 * The four room colour groups, each `[light, strong]`.
 *
 * From Home Assistant's `MapRendererColorScheme.segment`. Which group a room gets is decided by
 * the adapter, not here - it arrives as `meta.ha.colorIndex`, computed so that neighbouring rooms
 * never share a colour.
 */
export const SEGMENT_COLOURS: readonly (readonly [Rgb, Rgb])[] = [
	[
		[171, 199, 248],
		[121, 170, 255],
	], // blue
	[
		[249, 224, 125],
		[255, 211, 38],
	], // yellow
	[
		[184, 227, 255],
		[141, 210, 255],
	], // light blue
	[
		[184, 217, 141],
		[150, 217, 141],
	], // green
];

/** The non-room colours of Home Assistant's "Dreame Light" scheme. */
export const SCHEME = {
	floor: [221, 221, 221] as Rgb,
	wall: [159, 159, 159] as Rgb,
	/** A segment the robot has just scanned and that is not in the stored room structure yet. */
	newSegment: [153, 191, 255] as Rgb,
	/** A room the user hid in the app. */
	hiddenSegment: [226, 226, 226] as Rgb,
	/** A room that exists but is not part of the job currently running. */
	passiveSegment: [200, 200, 200] as Rgb,
} as const;

/** What the caller knows about the current job, all optional. */
export interface FloorOptions {
	/** Rooms hidden locally in this view, as opposed to hidden in the app. */
	hiddenLocally?: ReadonlySet<number>;
	/**
	 * Suppresses walls that have no visible room or floor near them.
	 *
	 * A wall belongs to no room, so hiding a room would otherwise leave its walls standing on
	 * their own. Costs a neighbourhood scan, so it is only done when something is actually hidden.
	 */
	hideOrphanedWalls?: boolean;
}

/** A finished RGBA buffer, ready for `ImageData` or a three.js texture. */
export interface FloorBitmap {
	width: number;
	height: number;
	/**
	 * `width * height * 4` bytes, row-major, top row first.
	 *
	 * Typed against `ArrayBuffer` rather than the default `ArrayBufferLike`, so it can be handed
	 * straight to `ImageData`, which refuses a buffer that might be shared.
	 */
	rgba: Uint8ClampedArray<ArrayBuffer>;
}

/** Reads a room's colour group, falling back to the room id where the adapter sent no index. */
export function segmentGroup(segment: number, colourIndex: Record<string, number> | undefined): readonly [Rgb, Rgb] {
	const index = colourIndex?.[String(segment)];
	const resolved = index != null ? index : segment - 1;
	const group = SEGMENT_COLOURS[((resolved % SEGMENT_COLOURS.length) + SEGMENT_COLOURS.length) % SEGMENT_COLOURS.length];
	// The modulo above cannot miss, but `noUncheckedIndexedAccess` cannot know that.
	return group ?? SEGMENT_COLOURS[0]!;
}

/**
 * The colour of one cell, or null where the cell is not drawn at all.
 *
 * The branch order is the contract; see the note at the top of the file.
 */
export function cellColour(
	cell: number,
	context: {
		knownRooms: ReadonlySet<number> | null;
		hiddenInApp: ReadonlySet<number>;
		hiddenLocally: ReadonlySet<number>;
		activeSegments: ReadonlySet<number>;
		zoneCleaning: boolean;
		colourIndex: Record<string, number> | undefined;
	},
): Rgb | null {
	if (!isSegment(cell)) {
		if (cell === PixelType.WALL) return SCHEME.wall;
		// Unknown is deliberately drawn as floor, which is what Home Assistant does.
		if (cell === PixelType.FLOOR || cell === PixelType.UNKNOWN) return SCHEME.floor;
		if (cell === PixelType.NEW_SEGMENT) return SCHEME.newSegment;
		return null;
	}

	// Hidden in this view: drawn by nobody, not even in the hidden-segment colour.
	if (context.hiddenLocally.has(cell)) return null;

	// 1. Hidden in the app wins over everything below it.
	if (context.hiddenInApp.has(cell)) return SCHEME.hiddenSegment;

	// 2. A segment the stored room structure does not know is a fresh scan, whatever else is true.
	if (context.knownRooms && !context.knownRooms.has(cell)) return SCHEME.newSegment;

	// 3. During zone cleaning Home Assistant skips room colouring entirely and the fallback shows.
	if (context.zoneCleaning) return SCHEME.newSegment;

	// 4. While a job runs, rooms outside it grey out.
	if (context.activeSegments.size > 0) {
		return context.activeSegments.has(cell) ? segmentGroup(cell, context.colourIndex)[0] : SCHEME.passiveSegment;
	}

	// 5. Nothing special about this room: its own colour.
	return segmentGroup(cell, context.colourIndex)[0];
}

/**
 * Paints the floor.
 *
 * The result is flipped vertically against the cell grid: the robot's world has Y pointing up,
 * an image has Y pointing down, so cell row `0` becomes the **last** pixel row. Getting this
 * wrong produces a map that looks right until you compare it with the robot's actual position.
 */
export function renderFloor(map: MapPackage, options: FloorOptions = {}): FloorBitmap {
	const { width, height } = map.header;
	const rgba = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));

	const ha = map.meta.ha ?? {};
	const hiddenInApp = new Set(ha.hiddenSegments ?? []);
	const activeSegments = new Set(ha.activeSegments ?? []);
	const hiddenLocally = options.hiddenLocally ?? new Set<number>();
	// No stored room structure at all means every segment counts as known, which is what the
	// widget does - it is the difference between "this room is new" and "we have no room list".
	const knownRooms = map.meta.seg_inf ? new Set(Object.keys(map.meta.seg_inf).map(Number)) : null;

	const wallVisible =
		options.hideOrphanedWalls && hiddenLocally.size > 0 ? visibleWalls(map, hiddenLocally) : null;

	const context = {
		knownRooms,
		hiddenInApp,
		hiddenLocally,
		activeSegments,
		zoneCleaning: ha.zoneCleaning === true,
		colourIndex: ha.colorIndex,
	};

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const cell = map.cells[y * width + x]!;
			if (cell === PixelType.WALL && wallVisible && !wallVisible.has(y * width + x)) continue;

			const colour = cellColour(cell, context);
			if (!colour) continue;

			const target = ((height - 1 - y) * width + x) * 4;
			rgba[target] = colour[0];
			rgba[target + 1] = colour[1];
			rgba[target + 2] = colour[2];
			rgba[target + 3] = 255;
		}
	}

	return { width, height, rgba };
}

/**
 * Wall cells that still have something visible within two cells of them.
 *
 * The radius of two is the widget's, and it is a compromise rather than a derivation: one cell
 * leaves gaps where a wall is two cells thick, and a larger radius starts keeping walls of rooms
 * that are entirely hidden.
 */
function visibleWalls(map: MapPackage, hiddenLocally: ReadonlySet<number>): Set<number> {
	const { width, height } = map.header;
	const visible = new Set<number>();

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (map.cells[y * width + x] !== PixelType.WALL) continue;

			for (let dy = -2; dy <= 2; dy++) {
				for (let dx = -2; dx <= 2; dx++) {
					const nx = x + dx;
					const ny = y + dy;
					if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;

					const neighbour = map.cells[ny * width + nx]!;
					const isVisibleRoom = isSegment(neighbour) && !hiddenLocally.has(neighbour);
					if (
						isVisibleRoom ||
						neighbour === PixelType.FLOOR ||
						neighbour === PixelType.NEW_SEGMENT ||
						neighbour === PixelType.UNKNOWN
					) {
						visible.add(y * width + x);
						dy = 3;
						break;
					}
				}
			}
		}
	}

	return visible;
}

/** Blends two colours, `factor` 0 keeping `from` and 1 reaching `towards`. */
export function mix(from: Rgb, towards: Rgb, factor: number): Rgb {
	return [
		Math.round(from[0] + (towards[0] - from[0]) * factor),
		Math.round(from[1] + (towards[1] - from[1]) * factor),
		Math.round(from[2] + (towards[2] - from[2]) * factor),
	];
}

/** Formats a colour for CSS. */
export function rgbCss(colour: Rgb): string {
	return `rgb(${colour[0]},${colour[1]},${colour[2]})`;
}

/**
 * The colour a room's label is written in.
 *
 * The room's own strong colour taken most of the way to black: dark enough to read on the pale
 * fill, but still recognisably the room's colour, so a label belongs to its room by hue as well
 * as by position. Taken from the widget's `labelStyle`.
 */
export function labelColour(segment: number, colourIndex: Record<string, number> | undefined): string {
	return rgbCss(mix(segmentGroup(segment, colourIndex)[1], [0, 0, 0], 0.6));
}
