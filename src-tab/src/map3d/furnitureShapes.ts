/**
 * What each kind of furniture is built out of.
 *
 * ## Why parts rather than one block
 *
 * A block in the right place at the right size is honest but mute: every piece looks the same, so
 * a floor plan full of them says only "something stands here". A table with four legs and a top
 * reads as a table from any angle, and costs a handful of numbers.
 *
 * ## What is measured and what is invented
 *
 * **Measured**, from the robot: where a piece stands, its footprint and its rotation.
 *
 * **Invented**, here: what it looks like. Every part list below is an ordinary piece of furniture
 * drawn from scratch - a bed is a mattress with a headboard and two pillows because beds are, not
 * because any file said so. This is a weaker claim than the footprint and it is meant to be: the
 * point is a shape that reads correctly, not a replica of anyone's furniture.
 *
 * Deliberately *not* done: using the models from the Dreame app. Those live inside the app package,
 * and shipping them would mean redistributing Dreame's assets.
 *
 * ## The coordinate frame
 *
 * Every part is given in fractions of the piece's own footprint, so one list serves every size the
 * robot reports:
 *
 * - `dx`, `dz` — centre offset, `-0.5` to `+0.5` of width and depth; `0,0` is the middle.
 * - `w`, `d` — size as a fraction of the width and depth.
 * - `y0`, `h` — bottom edge and height as a fraction of the piece's height.
 *
 * `y0 + h` may exceed 1 on purpose: a headboard is taller than the mattress it belongs to, and the
 * height in `FURNITURE_HEIGHT_MM` names the usable surface rather than the tallest point.
 *
 * `round` makes a part a cylinder standing on its base — a round table, a toilet bowl, a plant pot.
 * Everything else is a box.
 */

import { FurnitureType } from "./furniture3d";

/** One part of a piece of furniture. Every value is a fraction; see the module comment. */
export interface ShapePart {
	dx: number;
	dz: number;
	w: number;
	d: number;
	y0: number;
	h: number;
	round?: boolean;
}

/** A piece drawn as a single block filling its footprint - the fallback, and a fine cupboard. */
const BLOCK: readonly ShapePart[] = [{ dx: 0, dz: 0, w: 1, d: 1, y0: 0, h: 1 }];

/**
 * A bed: mattress, headboard along the far edge, pillows against it.
 *
 * The headboard goes against one short end, because a bed's footprint is reported lengthways and
 * the head is at one end of it. *Which* end is a guess - the robot reports an outline and an angle,
 * not which way somebody sleeps.
 */
function bed(pillows: 1 | 2): ShapePart[] {
	const parts: ShapePart[] = [
		// Mattress, sitting slightly inside the footprint so the headboard reads as separate.
		{ dx: 0, dz: 0.02, w: 1, d: 0.96, y0: 0, h: 1 },
		// Headboard: thin, and half again as tall as the mattress.
		{ dx: 0, dz: -0.48, w: 1, d: 0.04, y0: 0, h: 1.9 },
	];

	if (pillows === 1) {
		parts.push({ dx: 0, dz: -0.34, w: 0.6, d: 0.16, y0: 1, h: 0.35 });
	} else {
		parts.push({ dx: -0.24, dz: -0.34, w: 0.42, d: 0.16, y0: 1, h: 0.35 });
		parts.push({ dx: 0.24, dz: -0.34, w: 0.42, d: 0.16, y0: 1, h: 0.35 });
	}
	return parts;
}

/**
 * A seat with a back and two arms: armchair or sofa, the difference being only its footprint.
 *
 * @param armFraction How much of the width each arm takes. A narrow variant gets thinner arms.
 */
function seating(armFraction: number): ShapePart[] {
	const seatWidth = 1 - 2 * armFraction;
	return [
		// Seat cushion, set forward of the backrest.
		{ dx: 0, dz: 0.08, w: seatWidth, d: 0.84, y0: 0, h: 0.62 },
		// Backrest along the rear edge, full height.
		{ dx: 0, dz: -0.42, w: 1, d: 0.16, y0: 0, h: 1 },
		// Arms, lower than the back and running the depth of the seat.
		{ dx: -(0.5 - armFraction / 2), dz: 0.06, w: armFraction, d: 0.88, y0: 0, h: 0.82 },
		{ dx: 0.5 - armFraction / 2, dz: 0.06, w: armFraction, d: 0.88, y0: 0, h: 0.82 },
	];
}

/**
 * An L-shaped sofa: a main run plus a chaise along one side.
 *
 * @param onRight Which side the chaise extends to. The app distinguishes the two, so the map does.
 */
function cornerSofa(onRight: boolean): ShapePart[] {
	const side = onRight ? 1 : -1;
	return [
		// Main run, taking two thirds of the width.
		{ dx: -side * 0.17, dz: 0.08, w: 0.66, d: 0.6, y0: 0, h: 0.62 },
		{ dx: -side * 0.17, dz: -0.3, w: 0.66, d: 0.16, y0: 0, h: 1 },
		// The chaise, deeper and without a back of its own.
		{ dx: side * 0.33, dz: 0, w: 0.34, d: 1, y0: 0, h: 0.62 },
		{ dx: side * 0.45, dz: 0, w: 0.1, d: 1, y0: 0, h: 1 },
	];
}

/** A table: a top on four legs. The legs are inset so they read as legs and not as a plinth. */
function table(legInset = 0.06): ShapePart[] {
	const leg = 0.07;
	const at = 0.5 - legInset - leg / 2;
	return [
		{ dx: 0, dz: 0, w: 1, d: 1, y0: 0.9, h: 0.1 },
		{ dx: -at, dz: -at, w: leg, d: leg, y0: 0, h: 0.9 },
		{ dx: at, dz: -at, w: leg, d: leg, y0: 0, h: 0.9 },
		{ dx: -at, dz: at, w: leg, d: leg, y0: 0, h: 0.9 },
		{ dx: at, dz: at, w: leg, d: leg, y0: 0, h: 0.9 },
	];
}

/** A cupboard with door panels, so the front is distinguishable from the back. */
function cabinet(doors: 1 | 2): ShapePart[] {
	const parts: ShapePart[] = [{ dx: 0, dz: 0, w: 1, d: 1, y0: 0, h: 1 }];
	// Panels set flush into the front face, not proud of it: the footprint is the one thing the
	// robot actually measured, and a detail sticking out past it would be inventing size.
	if (doors === 1) {
		parts.push({ dx: 0, dz: 0.48, w: 0.86, d: 0.04, y0: 0.04, h: 0.92 });
	} else {
		parts.push({ dx: -0.23, dz: 0.48, w: 0.42, d: 0.04, y0: 0.04, h: 0.92 });
		parts.push({ dx: 0.23, dz: 0.48, w: 0.42, d: 0.04, y0: 0.04, h: 0.92 });
	}
	return parts;
}

/** An open shelf: two uprights and four boards. */
const SHELF: readonly ShapePart[] = [
	{ dx: -0.47, dz: 0, w: 0.06, d: 1, y0: 0, h: 1 },
	{ dx: 0.47, dz: 0, w: 0.06, d: 1, y0: 0, h: 1 },
	{ dx: 0, dz: -0.46, w: 1, d: 0.08, y0: 0, h: 1 },
	{ dx: 0, dz: 0, w: 0.9, d: 0.9, y0: 0.02, h: 0.05 },
	{ dx: 0, dz: 0, w: 0.9, d: 0.9, y0: 0.33, h: 0.05 },
	{ dx: 0, dz: 0, w: 0.9, d: 0.9, y0: 0.64, h: 0.05 },
	{ dx: 0, dz: 0, w: 0.9, d: 0.9, y0: 0.95, h: 0.05 },
];

/** A toilet: a rounded bowl with a cistern behind it. */
const TOILET: readonly ShapePart[] = [
	{ dx: 0, dz: 0.12, w: 0.8, d: 0.7, y0: 0, h: 0.72, round: true },
	{ dx: 0, dz: -0.36, w: 0.9, d: 0.26, y0: 0, h: 1.05 },
];

/** A plant: pot below, foliage above and wider. */
const PLANT: readonly ShapePart[] = [
	{ dx: 0, dz: 0, w: 0.6, d: 0.6, y0: 0, h: 0.38, round: true },
	{ dx: 0, dz: 0, w: 1, d: 1, y0: 0.38, h: 0.72, round: true },
];

/** A washing machine: a body with a round door on the front. */
const WASHING_MACHINE: readonly ShapePart[] = [
	{ dx: 0, dz: 0, w: 1, d: 1, y0: 0, h: 1 },
	{ dx: 0, dz: 0.47, w: 0.58, d: 0.06, y0: 0.34, h: 0.58, round: true },
];

/** A fridge: a body split by the line between its two doors. */
const FRIDGE: readonly ShapePart[] = [
	{ dx: 0, dz: 0, w: 1, d: 1, y0: 0, h: 1 },
	{ dx: 0, dz: 0.48, w: 0.92, d: 0.04, y0: 0.02, h: 0.62 },
	{ dx: 0, dz: 0.48, w: 0.92, d: 0.04, y0: 0.68, h: 0.3 },
];

/** A shallow tray: litter box, pet toilet. */
const TRAY: readonly ShapePart[] = [
	{ dx: 0, dz: 0, w: 1, d: 1, y0: 0, h: 0.4 },
	{ dx: 0, dz: -0.47, w: 1, d: 0.06, y0: 0, h: 1 },
	{ dx: 0, dz: 0.47, w: 1, d: 0.06, y0: 0, h: 1 },
	{ dx: -0.47, dz: 0, w: 0.06, d: 1, y0: 0, h: 1 },
	{ dx: 0.47, dz: 0, w: 0.06, d: 1, y0: 0, h: 1 },
];

/** A tall mirror: a panel on a foot. */
const MIRROR: readonly ShapePart[] = [
	{ dx: 0, dz: 0, w: 1, d: 0.12, y0: 0.06, h: 0.94 },
	{ dx: 0, dz: 0, w: 0.5, d: 0.5, y0: 0, h: 0.06 },
];

/**
 * Part lists by furniture type.
 *
 * A type that is absent falls back to {@link BLOCK} - a missing shape costs detail, never the
 * piece itself, so a type the app gains later still appears at the right size in the right place.
 */
export const FURNITURE_SHAPES: Readonly<Record<number, readonly ShapePart[]>> = {
	[FurnitureType.SINGLE_BED]: bed(1),
	[FurnitureType.DOUBLE_BED]: bed(2),
	[FurnitureType.ARM_CHAIR]: seating(0.16),
	[FurnitureType.ARM_CHAIR_NARROW]: seating(0.1),
	[FurnitureType.TWO_SEAT_SOFA]: seating(0.12),
	[FurnitureType.THREE_SEAT_SOFA]: seating(0.1),
	[FurnitureType.THREE_SEAT_SOFA_NARROW]: seating(0.07),
	[FurnitureType.L_SHAPED_SOFA]: cornerSofa(false),
	[FurnitureType.L_SHAPED_SOFA_RIGHT]: cornerSofa(true),
	[FurnitureType.DINING_TABLE]: table(),
	[FurnitureType.TABLE]: table(),
	[FurnitureType.COFFEE_TABLE]: table(0.1),
	[FurnitureType.ROUND_COFFEE_TABLE]: [
		{ dx: 0, dz: 0, w: 1, d: 1, y0: 0.88, h: 0.12, round: true },
		{ dx: 0, dz: 0, w: 0.16, d: 0.16, y0: 0, h: 0.88, round: true },
		{ dx: 0, dz: 0, w: 0.5, d: 0.5, y0: 0, h: 0.05, round: true },
	],
	[FurnitureType.TOILET]: TOILET,
	[FurnitureType.NIGHTSTAND]: cabinet(1),
	[FurnitureType.SHOE_CABINET]: cabinet(2),
	[FurnitureType.WARDROBE]: cabinet(2),
	[FurnitureType.TV_CABINET]: cabinet(2),
	[FurnitureType.BOOKSHELF]: SHELF,
	[FurnitureType.REFRIGERATOR]: FRIDGE,
	[FurnitureType.WASHING_MACHINE]: WASHING_MACHINE,
	[FurnitureType.GREENERY]: PLANT,
	[FurnitureType.FLOOR_MIRROR]: MIRROR,
	[FurnitureType.LITTER_BOX]: TRAY,
	[FurnitureType.PET_TOILET]: TRAY,
	[FurnitureType.ENCLOSED_LITTER_BOX]: [
		{ dx: 0, dz: 0, w: 1, d: 1, y0: 0, h: 1 },
		// The opening, as a recess proud of the front face.
		{ dx: 0, dz: 0.475, w: 0.5, d: 0.05, y0: 0.15, h: 0.6, round: true },
	],
	[FurnitureType.PET_BED]: [{ dx: 0, dz: 0, w: 1, d: 1, y0: 0, h: 1, round: true }],
	[FurnitureType.FOOD_BOWL]: [{ dx: 0, dz: 0, w: 0.8, d: 0.8, y0: 0, h: 1, round: true }],
	[FurnitureType.AIR_CONDITIONER]: [
		{ dx: 0, dz: 0, w: 1, d: 1, y0: 0, h: 1 },
		{ dx: 0, dz: 0.475, w: 0.7, d: 0.05, y0: 0.55, h: 0.35 },
	],
};

/** The parts a type is drawn from; a single block where the type has no list of its own. */
export function shapeFor(type: number | null | undefined): readonly ShapePart[] {
	if (type == null) return BLOCK;
	return FURNITURE_SHAPES[type] ?? BLOCK;
}
