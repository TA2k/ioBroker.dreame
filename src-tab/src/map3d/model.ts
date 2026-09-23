/**
 * Everything the 3D scene is built from, in one coordinate system.
 *
 * ## One unit is one cell
 *
 * The scene works in cells, not millimetres. The grid is already in cells, the floor texture is
 * one pixel per cell, and a scene in millimetres would put the camera thousands of units away
 * from a floor a few hundred wide - which costs depth-buffer precision for nothing. Heights, the
 * only quantity that arrives in millimetres, are divided by the grid size on the way in.
 *
 * ## Nothing new is fetched
 *
 * Every field here comes out of the same `map.mergedCloud` package the 2D view already decodes.
 * Switching to 3D costs the robot nothing and the adapter nothing; it is the same data, drawn
 * differently. The floor texture is the same bitmap `renderFloor` produces for the 2D canvas.
 */

import { renderFloor } from "../map/floorBitmap";
import type { FloorBitmap } from "../map/floorBitmap";
import { wallsOf } from "./walls";
import type { WallRect } from "./walls";
import { furnitureHeightMm } from "./furniture3d";
import { buildTrailPaths } from "../map/trail";
import type { TrailPaths } from "../map/trail";
import type { MapPackage, Rect4 } from "../map/mapPackage";

/**
 * Wall height in millimetres.
 *
 * The app's own constant, by way of the Roborock work that read it out of the app: 10 world units
 * at one unit per 50 mm cell. Unlike the furniture heights this is not a guess - but it is a
 * robot app's idea of a wall, not a measurement of anyone's flat, and real walls are taller. It
 * is chosen for a view you look *into* from above; full-height walls would hide the floor.
 */
export const WALL_HEIGHT_MM = 500;

/** A point in cell coordinates. */
export interface CellPoint {
	x: number;
	y: number;
}

/** Something standing on the floor with a footprint and a heading. */
export interface Body extends CellPoint {
	/** Footprint in cells. */
	width: number;
	depth: number;
	/** Height in cells. */
	height: number;
	/** Rotation in degrees, as the robot reports it. */
	angle: number;
	/** Furniture type, so the scene can look up what shape to draw it as. */
	type: number;
}

/** A flat area drawn on the floor, in cells. */
export interface FloorArea {
	x: number;
	y: number;
	width: number;
	depth: number;
}

/** Everything the scene needs. */
export interface Map3DModel {
	/** Grid size in cells. */
	width: number;
	height: number;
	/** Wall boxes, in cell coordinates; y is already flipped into image space. */
	walls: WallRect[];
	/** How many cells went into those boxes, so the view can report the reduction. */
	wallCellCount: number;
	/** Wall height in cells. */
	wallHeight: number;
	furniture: Body[];
	noGoZones: FloorArea[];
	noMopZones: FloorArea[];
	/** Virtual walls, as pairs of points in cell coordinates. */
	virtualWalls: { from: CellPoint; to: CellPoint }[];
	/** The driven path, in the same cell coordinates, painted onto the floor texture. */
	trail: TrailPaths;
	/**
	 * Robot position, from this very package rather than the separate `map.robot` state.
	 *
	 * The dock is deliberately absent: it lives in its own state, not in the map package, so
	 * carrying a field here that is always null would be worse than not having one.
	 */
	robot: (CellPoint & { angle: number }) | null;
	/** The floor picture, one pixel per cell. */
	floor: FloorBitmap;
	/** Room labels: what to write and where, in cell coordinates. */
	labels: { id: number; text: string; at: CellPoint }[];
}

/** Converts a world point in millimetres into cell coordinates, flipped into image space. */
export function worldToCell(x: number, y: number, map: MapPackage): CellPoint {
	const { gridSize, height, origin } = map.header;
	return {
		x: (x - origin.x) / gridSize,
		// The same term the trail uses, and for the same reason: the shorter-looking form is a
		// whole cell out.
		y: (height * gridSize - 1 - (y - origin.y)) / gridSize,
	};
}

/** Converts an axis-aligned world rectangle into a floor area in cells. */
function rectToArea(rect: Rect4, map: MapPackage): FloorArea {
	const a = worldToCell(rect[0], rect[1], map);
	const b = worldToCell(rect[2], rect[3], map);
	return {
		x: Math.min(a.x, b.x),
		y: Math.min(a.y, b.y),
		width: Math.abs(b.x - a.x),
		depth: Math.abs(b.y - a.y),
	};
}

/**
 * Builds the model.
 *
 * @param hiddenRooms Rooms hidden in this view, passed on to the floor renderer so the 3D floor
 *   matches the 2D one.
 */
export function buildModel(
	map: MapPackage,
	hiddenRooms?: ReadonlySet<number>,
	/** Rooms to label, already named by the caller so 2D and 3D read identically. */
	rooms: readonly { id: number; centre: CellPoint; label?: string }[] = [],
): Map3DModel {
	const { width, height, gridSize } = map.header;
	const ha = map.meta.ha ?? {};

	// Walls come out in cell space, where row 0 is the bottom. The floor texture is flipped, so
	// they have to be flipped too or the walls would sit on the mirror image of the floor.
	const walls = wallsOf(map).map(rect => ({
		x: rect.x,
		y: height - rect.y - rect.height,
		width: rect.width,
		height: rect.height,
	}));

	const furniture: Body[] = (ha.furnitures ?? [])
		// A piece with no footprint is a piece the robot has not measured; a zero-size box is a
		// speck of z-fighting on the floor.
		.filter(piece => piece.w > 0 && piece.h > 0)
		.map(piece => {
			const centre = worldToCell(piece.x, piece.y, map);
			return {
				x: centre.x,
				y: centre.y,
				width: piece.w / gridSize,
				depth: piece.h / gridSize,
				height: furnitureHeightMm(piece.type) / gridSize,
				angle: piece.angle ?? 0,
				type: piece.type ?? 0,
			};
		});

	const virtualWalls = (ha.virtualWalls ?? []).map(line => ({
		from: worldToCell(line[0], line[1], map),
		to: worldToCell(line[2], line[3], map),
	}));

	const robotPoint = map.header.robot;

	return {
		width,
		height,
		walls,
		wallCellCount: walls.reduce((sum, rect) => sum + rect.width * rect.height, 0),
		wallHeight: WALL_HEIGHT_MM / gridSize,
		furniture,
		noGoZones: (ha.noGo ?? []).map(rect => rectToArea(rect, map)),
		noMopZones: (ha.noMop ?? []).map(rect => rectToArea(rect, map)),
		virtualWalls,
		trail: buildTrailPaths(map),
		// Centroids arrive already flipped into image space, so they need no conversion here.
		labels: rooms
			.filter(room => room.label && !hiddenRooms?.has(room.id))
			.map(room => ({ id: room.id, text: room.label!, at: room.centre })),
		robot: robotPoint
			? { ...worldToCell(robotPoint.x, robotPoint.y, map), angle: ha.robotAngle ?? 0 }
			: null,
		floor: renderFloor(map, hiddenRooms ? { hiddenLocally: hiddenRooms, hideOrphanedWalls: true } : {}),
	};
}

/**
 * A key that changes only when the scene's geometry does.
 *
 * While the robot cleans, a fresh map arrives every few seconds and almost all of it is
 * identical - the path grew, nothing moved. Rebuilding every wall and every piece of furniture
 * for that is wasted work and a visible stutter, so the view compares this instead and rebuilds
 * only when it differs.
 */
export function geometryKey(map: MapPackage): string {
	const ha = map.meta.ha ?? {};
	return [
		map.header.width,
		map.header.height,
		map.header.gridSize,
		map.header.origin.x,
		map.header.origin.y,
		(ha.furnitures ?? []).length,
		(ha.noGo ?? []).length,
		(ha.noMop ?? []).length,
		(ha.virtualWalls ?? []).length,
	].join(":");
}
