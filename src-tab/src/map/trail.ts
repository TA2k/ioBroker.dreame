/**
 * The path the robot drove, as two SVG paths.
 *
 * ## Why two and not one
 *
 * Home Assistant draws the run as a thin vacuum line and a wide, semi-transparent mopping band,
 * and a section can belong to both - that is what "vacuum and mop" means. Drawing one path and
 * varying its width would need a separate path per section anyway, so the split is by job rather
 * than by section: every point that vacuums goes into one, every point that mops into the other,
 * and a section that does both is in each. The wide band under the thin line is what produces the
 * look of the existing widget.
 *
 * ## Section types
 *
 * `trpts` carries `[x, y, type]` per point, in world millimetres. The type is Home Assistant's
 * `PathType`:
 *
 * | value | meaning                                              |
 * | ----- | ---------------------------------------------------- |
 * | 0     | continues the current section                        |
 * | 1     | starts a vacuuming section                           |
 * | 2     | starts a vacuuming **and** mopping section           |
 * | 3     | starts a mopping section                             |
 *
 * A non-zero value is also a **break**: the robot repositioned, so the line has to lift rather
 * than draw a straight dash across the flat to where it resumed. Zero has to keep meaning
 * "continuation" - the adapter chose these numbers so older drawing code that only tests
 * `!== 0` keeps working.
 *
 * ## Not yet ported
 *
 * The widget animates a playhead along the trail and clips the mopping band to room areas with an
 * SVG mask. Both are refinements on top of these paths, not part of producing them.
 */

import type { MapHeader, MapPackage, PathPoint } from "./mapPackage";

/** What a section of the path is doing. */
export const PathType = {
	CONTINUE: 0,
	VACUUM: 1,
	VACUUM_AND_MOP: 2,
	MOP: 3,
} as const;

/** A point in image coordinates, in cells. */
export interface ImagePoint {
	x: number;
	y: number;
}

/** The two paths, as SVG `d` strings. Either can be empty. */
export interface TrailPaths {
	/** Sections that vacuum: thin line. */
	vacuum: string;
	/** Sections that mop: wide band. */
	mop: string;
}

/**
 * Converts world millimetres into image cells.
 *
 * This is Home Assistant's `MapImageDimensions.to_img`, and the Y term is the part worth reading
 * twice: it is `(height * gridSize - 1) - (y - originY)`, **not** `height - 1 - (y - originY) /
 * gridSize`. The widget carried the second form once and every marker and trail sat about one
 * cell off - close enough to look right and wrong everywhere.
 */
export function worldToImage(x: number, y: number, header: MapHeader): ImagePoint {
	const { gridSize, height, origin } = header;
	return {
		x: (x - origin.x) / gridSize,
		y: (height * gridSize - 1 - (y - origin.y)) / gridSize,
	};
}

/**
 * Assigns every point the type of the section it belongs to.
 *
 * Starts at `VACUUM`: a run whose first point carries no type is a vacuuming run, which is what
 * the widget assumes and what the robot does by default.
 */
export function sectionTypes(points: readonly PathPoint[]): number[] {
	const types = new Array<number>(points.length);
	let current: number = PathType.VACUUM;

	for (let i = 0; i < points.length; i++) {
		const type = points[i]![2];
		if (type !== PathType.CONTINUE) current = type;
		types[i] = current;
	}

	return types;
}

/** True where a section type means the robot was vacuuming. */
export function isVacuum(type: number): boolean {
	return type === PathType.VACUUM || type === PathType.VACUUM_AND_MOP;
}

/** True where a section type means the robot was mopping. */
export function isMop(type: number): boolean {
	return type === PathType.MOP || type === PathType.VACUUM_AND_MOP;
}

/**
 * Builds one SVG path out of the points a predicate accepts.
 *
 * The line lifts in two cases: at a point that starts a new section, because the robot got there
 * without cleaning, and after any point the predicate rejected, because the run left this path
 * and came back.
 */
function buildPath(
	points: readonly PathPoint[],
	types: readonly number[],
	header: MapHeader,
	belongs: (type: number) => boolean,
): string {
	const parts: string[] = [];
	let drawing = false;

	for (let i = 0; i < points.length; i++) {
		if (!belongs(types[i]!)) {
			drawing = false;
			continue;
		}

		const point = points[i]!;
		const { x, y } = worldToImage(point[0], point[1], header);
		const command = !drawing || point[2] !== PathType.CONTINUE ? "M" : "L";
		parts.push(`${command}${x.toFixed(1)} ${y.toFixed(1)}`);
		drawing = true;
	}

	return parts.join(" ");
}

/** Builds both paths for a decoded map. */
export function buildTrailPaths(map: MapPackage): TrailPaths {
	const points = map.meta.trpts ?? [];
	if (points.length === 0) return { vacuum: "", mop: "" };

	const types = sectionTypes(points);
	return {
		vacuum: buildPath(points, types, map.header, isVacuum),
		mop: buildPath(points, types, map.header, isMop),
	};
}
