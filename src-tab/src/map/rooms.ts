/**
 * Finds the rooms in a decoded map: where each one sits, how big it is and what it is called.
 *
 * ## What counts as a room
 *
 * A cell value between 1 and 251 is a segment, but not every segment is a room. The robot hands
 * out provisional numbers while it drives, and those appear in the raster long before they exist
 * in the stored room structure. The widget's rule, followed here, is that a segment is a room only
 * if `seg_inf` knows it - anything else is a fresh scan and is left unlabelled rather than being
 * given a name it does not have.
 *
 * ## Coordinates
 *
 * Centroids come out in **image** coordinates, already flipped the way {@link renderFloor} flips
 * the floor. Handing back cell coordinates would mean every caller had to remember to flip, and
 * the one that forgot would put its labels in a mirrored position that still looks plausible.
 */

import { isSegment, segmentName } from "./mapPackage";
import type { MapPackage } from "./mapPackage";

/** One room, ready to label. */
export interface RoomInfo {
	/** Segment id, i.e. the cell value. */
	id: number;
	/** Free-text name given in the app, or null. Step 2 of the naming rule. */
	customName: string | null;
	/** Room type from the app's list, 1..15; 0 means none was chosen. Step 1 of the rule. */
	type: number;
	/** Which room of this type it is. 0 is the first, and stays unnumbered. */
	typeIndex: number;
	/** Centre of mass, in image coordinates (y already flipped). */
	centre: { x: number; y: number };
	/** Bounding box in image coordinates, inclusive. */
	bounds: { minX: number; minY: number; maxX: number; maxY: number };
	/** How many cells the room covers. A measure of how seriously to take it. */
	cellCount: number;
}

export interface CollectRoomsOptions {
	/**
	 * Rooms smaller than this are dropped.
	 *
	 * The live raster carries specks of stray segment ids, and a label on a four-cell speck is
	 * noise sitting on top of the map. Zero keeps everything, which is what the tests want.
	 */
	minCells?: number;
	/** Rooms hidden in this view, left out entirely. */
	hiddenLocally?: ReadonlySet<number>;
}

/**
 * Collects every labellable room.
 *
 * One pass over the grid, accumulating sums rather than collecting cells: a room can be tens of
 * thousands of cells and only its centre and extent are wanted.
 */
export function collectRooms(map: MapPackage, options: CollectRoomsOptions = {}): RoomInfo[] {
	const { width, height } = map.header;
	const minCells = options.minCells ?? 0;
	const hiddenLocally = options.hiddenLocally ?? new Set<number>();

	const segmentInfo = map.meta.seg_inf;
	const hiddenInApp = new Set(map.meta.ha?.hiddenSegments ?? []);

	interface Accumulator {
		sumX: number;
		sumY: number;
		count: number;
		minX: number;
		minY: number;
		maxX: number;
		maxY: number;
	}
	const accumulators = new Map<number, Accumulator>();

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const cell = map.cells[y * width + x]!;
			if (!isSegment(cell)) continue;
			if (hiddenInApp.has(cell) || hiddenLocally.has(cell)) continue;
			// No stored room structure at all means nothing can be confirmed as a room, so nothing
			// is labelled - the same rule the floor renderer applies from the other direction.
			if (!segmentInfo || segmentInfo[String(cell)] === undefined) continue;

			// Flipped here, once, so every consumer works in the same space as the pixels.
			const imageY = height - 1 - y;

			const existing = accumulators.get(cell);
			if (existing) {
				existing.sumX += x;
				existing.sumY += imageY;
				existing.count++;
				if (x < existing.minX) existing.minX = x;
				if (x > existing.maxX) existing.maxX = x;
				if (imageY < existing.minY) existing.minY = imageY;
				if (imageY > existing.maxY) existing.maxY = imageY;
			} else {
				accumulators.set(cell, {
					sumX: x,
					sumY: imageY,
					count: 1,
					minX: x,
					maxX: x,
					minY: imageY,
					maxY: imageY,
				});
			}
		}
	}

	const rooms: RoomInfo[] = [];
	for (const [id, accumulator] of accumulators) {
		if (accumulator.count < minCells) continue;
		const info = segmentInfo?.[String(id)];
		rooms.push({
			id,
			customName: segmentName(info),
			type: info?.type ?? 0,
			typeIndex: info?.index ?? 0,
			centre: {
				x: accumulator.sumX / accumulator.count,
				y: accumulator.sumY / accumulator.count,
			},
			bounds: {
				minX: accumulator.minX,
				minY: accumulator.minY,
				maxX: accumulator.maxX,
				maxY: accumulator.maxY,
			},
			cellCount: accumulator.count,
		});
	}

	// Largest first, so a caller that can only show a few shows the ones that matter.
	rooms.sort((a, b) => b.cellCount - a.cellCount);
	return rooms;
}

/**
 * Groups rooms into connected clusters by proximity of their bounding boxes.
 *
 * A dreame robot can hold several stored maps - different floors - and they do not share a
 * coordinate origin, so a raster that holds more than one shows them as separate blocks with
 * empty space between. Telling those apart matters: two blocks mean the view is showing two
 * floors at once, which is worth saying out loud rather than leaving the user to wonder why their
 * flat appears twice.
 *
 * The test is deliberately crude - bounding boxes within `gap` cells of each other are one
 * cluster - because it only has to separate blocks that are far apart, not trace room outlines.
 *
 * @param gap How much empty space still counts as connected, in cells.
 */
export function clusterRooms(rooms: RoomInfo[], gap = 20): RoomInfo[][] {
	const remaining = [...rooms];
	const clusters: RoomInfo[][] = [];

	while (remaining.length > 0) {
		const cluster = [remaining.shift()!];

		// Repeats until nothing more joins: a room may only touch the cluster through another room
		// that joined after the first pass looked at it.
		let grew = true;
		while (grew) {
			grew = false;
			for (let i = remaining.length - 1; i >= 0; i--) {
				const candidate = remaining[i]!;
				if (cluster.some(member => boxesNear(member.bounds, candidate.bounds, gap))) {
					cluster.push(candidate);
					remaining.splice(i, 1);
					grew = true;
				}
			}
		}

		clusters.push(cluster);
	}

	return clusters;
}

/** True where two boxes overlap or come within `gap` cells of each other. */
function boxesNear(a: RoomInfo["bounds"], b: RoomInfo["bounds"], gap: number): boolean {
	const apart =
		a.minX - b.maxX > gap || b.minX - a.maxX > gap || a.minY - b.maxY > gap || b.minY - a.maxY > gap;
	return !apart;
}

/**
 * Builds the label a room is shown under.
 *
 * Follows Home Assistant's `set_name()` exactly, in this order:
 *
 * 1. A room **type** chosen in the app wins, translated, and from the second room of that type
 *    onwards it is numbered - "Bathroom", then "Bathroom 2". Type `0` is excluded deliberately:
 *    it is the "no type chosen" value, and treating it as a type would label every untyped room
 *    with the same word.
 * 2. Otherwise the free-text name typed into the app.
 * 3. Otherwise the segment id, as "Room 7".
 *
 * The translation is injected rather than imported so this stays testable without an i18n store -
 * and so the room-type list is translatable at all, which it is not in the existing widget, where
 * the table is hard-coded German regardless of the user's language.
 *
 * @param translateType Returns the translated name of a room type, or null where the type is
 *   unknown or untranslated, in which case the rule falls through to the next step.
 * @param fallback Builds the step-3 label from the segment id.
 */
export function roomDisplayName(
	room: Pick<RoomInfo, "id" | "customName" | "type" | "typeIndex">,
	translateType: (type: number) => string | null,
	fallback: (id: number) => string,
): string {
	if (room.type !== 0) {
		const typeName = translateType(room.type);
		if (typeName) {
			return room.typeIndex > 0 ? `${typeName} ${room.typeIndex + 1}` : typeName;
		}
	}
	return room.customName ?? fallback(room.id);
}

/** A room with the name it is shown under. */
export interface LabelledRoom extends RoomInfo {
	label: string;
}

/**
 * Names every room in a list.
 *
 * Done once, above both views, rather than in each: the 2D labels, the 3D labels and anything
 * else that names a room have to agree, and three copies of the naming rule is three chances for
 * one of them to drift.
 *
 * @param translate Resolves a translation key, returning the key itself when there is no
 *   translation - which is how {@link roomDisplayName} is told to fall through to the next step.
 */
export function labelRooms(rooms: readonly RoomInfo[], translate: (key: string, ...args: string[]) => string): LabelledRoom[] {
	return rooms.map(room => ({
		...room,
		label: roomDisplayName(
			room,
			type => {
				const key = `room.type.${type}`;
				const translated = translate(key);
				return translated === key ? null : translated;
			},
			id => translate("room.fallback", String(id)),
		),
	}));
}
