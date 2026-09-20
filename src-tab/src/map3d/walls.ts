/**
 * Turns wall cells into a handful of boxes.
 *
 * ## Why not one box per cell
 *
 * A flat of 200 m² has tens of thousands of cells, several thousand of them wall. Extruding each
 * one gives that many meshes, which is both slow and ugly: the seams between neighbouring cubes
 * catch the light and the result reads as gravel rather than as a wall. Roborock's own 3D view
 * hit exactly this, and their notes say the app avoids it by merging cells into runs first.
 *
 * ## Greedy meshing
 *
 * The classic voxel technique, and a better fit here than merging per axis: scan for an unused
 * wall cell, extend it as far right as the row allows, then extend that strip downwards as far as
 * every row beneath is wall across its whole width. Emit the rectangle, mark it used, continue.
 *
 * A straight wall becomes one long box whichever way it runs, and a thick wall becomes one box
 * rather than two layers of them - so there is no need for the separate "discard cells enclosed
 * inside a wall" pass that a per-cell approach requires. The result covers exactly the wall cells,
 * no more and no less, which is what makes it safe to test by comparing areas.
 */

import { PixelType } from "../map/mapPackage";
import type { MapPackage } from "../map/mapPackage";

/** An axis-aligned rectangle of wall cells, in cell coordinates. */
export interface WallRect {
	/** Left edge, in cells. */
	x: number;
	/** Top edge in **cell** space, i.e. before the image flip. */
	y: number;
	width: number;
	height: number;
}

/**
 * Merges the wall cells of a grid into rectangles.
 *
 * @param cells One byte per cell, row-major.
 * @param width Grid width in cells.
 * @param height Grid height in cells.
 */
export function mergeWalls(cells: Uint8Array, width: number, height: number): WallRect[] {
	if (width <= 0 || height <= 0) return [];

	const used = new Uint8Array(width * height);
	const rects: WallRect[] = [];

	const isWall = (x: number, y: number): boolean =>
		cells[y * width + x] === PixelType.WALL && used[y * width + x] === 0;

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (!isWall(x, y)) continue;

			// Widest run starting here.
			let runWidth = 1;
			while (x + runWidth < width && isWall(x + runWidth, y)) runWidth++;

			// Tallest block of that width. A row that is not wall across the full width stops it -
			// taking a narrower block instead would leave slivers for the next pass to pick up, and
			// more boxes is the thing this exists to avoid.
			let runHeight = 1;
			while (y + runHeight < height) {
				let full = true;
				for (let dx = 0; dx < runWidth; dx++) {
					if (!isWall(x + dx, y + runHeight)) {
						full = false;
						break;
					}
				}
				if (!full) break;
				runHeight++;
			}

			for (let dy = 0; dy < runHeight; dy++) {
				for (let dx = 0; dx < runWidth; dx++) used[(y + dy) * width + x + dx] = 1;
			}

			rects.push({ x, y, width: runWidth, height: runHeight });
		}
	}

	return rects;
}

/** Convenience wrapper over a decoded package. */
export function wallsOf(map: MapPackage): WallRect[] {
	return mergeWalls(map.cells, map.header.width, map.header.height);
}

/** Counts the wall cells in a grid, for reporting the reduction the merge achieved. */
export function countWallCells(cells: Uint8Array): number {
	let count = 0;
	for (const cell of cells) if (cell === PixelType.WALL) count++;
	return count;
}
