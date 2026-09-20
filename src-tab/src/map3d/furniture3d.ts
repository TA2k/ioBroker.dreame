/**
 * Furniture as plain bodies: one box per piece, at its measured footprint and angle.
 *
 * ## Why boxes and not models
 *
 * The Dreame app draws modelled furniture, and those models live inside the app package and
 * nowhere else. Shipping them would mean redistributing Dreame's assets, which this project does
 * not do - the same line the Roborock work drew, and then crossed by bundling 6 MB of extracted
 * geometry with a notice saying it must not be redistributed. A box in the right place, at the
 * right size and turned the right way, says what a floor plan needs to say.
 *
 * ## What is measured and what is chosen
 *
 * **Measured**, straight from the map: where a piece stands, how large its footprint is, and how
 * it is rotated. Those come from the robot.
 *
 * **Chosen**: how tall it is. The robot is a floor-level lidar; it reports outlines and never
 * elevations, and nothing in the protocol carries a height. Every number below is an ordinary
 * piece of furniture's usual height, picked so the view reads well. They are the weakest claim in
 * this module and the first thing to change if someone simply prefers different ones.
 */

/** Furniture type ids, from `FurnitureType` in `lib/haMap.js`. */
export const FurnitureType = {
	SINGLE_BED: 1,
	DOUBLE_BED: 2,
	ARM_CHAIR: 3,
	TWO_SEAT_SOFA: 4,
	THREE_SEAT_SOFA: 5,
	DINING_TABLE: 6,
	NIGHTSTAND: 7,
	COFFEE_TABLE: 8,
	TOILET: 9,
	LITTER_BOX: 10,
	PET_BED: 11,
	FOOD_BOWL: 12,
	PET_TOILET: 13,
	REFRIGERATOR: 14,
	WASHING_MACHINE: 15,
	ENCLOSED_LITTER_BOX: 16,
	AIR_CONDITIONER: 17,
	TV_CABINET: 18,
	BOOKSHELF: 19,
	SHOE_CABINET: 20,
	WARDROBE: 21,
	GREENERY: 22,
	FLOOR_MIRROR: 23,
	L_SHAPED_SOFA: 24,
	ROUND_COFFEE_TABLE: 25,
	TABLE: 26,
	ARM_CHAIR_NARROW: 29,
	THREE_SEAT_SOFA_NARROW: 30,
	L_SHAPED_SOFA_RIGHT: 31,
} as const;

/**
 * Height of each type in millimetres - **chosen, not measured**; see the note above.
 *
 * Beds are the mattress top rather than the headboard, and sofas the backrest, because that is
 * the height the outline belongs to.
 */
export const FURNITURE_HEIGHT_MM: Readonly<Record<number, number>> = {
	[FurnitureType.SINGLE_BED]: 500,
	[FurnitureType.DOUBLE_BED]: 500,
	[FurnitureType.ARM_CHAIR]: 800,
	[FurnitureType.TWO_SEAT_SOFA]: 800,
	[FurnitureType.THREE_SEAT_SOFA]: 800,
	[FurnitureType.DINING_TABLE]: 750,
	[FurnitureType.NIGHTSTAND]: 550,
	[FurnitureType.COFFEE_TABLE]: 400,
	[FurnitureType.TOILET]: 750,
	[FurnitureType.LITTER_BOX]: 200,
	[FurnitureType.PET_BED]: 200,
	[FurnitureType.FOOD_BOWL]: 100,
	[FurnitureType.PET_TOILET]: 200,
	[FurnitureType.REFRIGERATOR]: 1800,
	[FurnitureType.WASHING_MACHINE]: 850,
	[FurnitureType.ENCLOSED_LITTER_BOX]: 450,
	[FurnitureType.AIR_CONDITIONER]: 700,
	[FurnitureType.TV_CABINET]: 500,
	[FurnitureType.BOOKSHELF]: 1800,
	[FurnitureType.SHOE_CABINET]: 900,
	[FurnitureType.WARDROBE]: 2000,
	[FurnitureType.GREENERY]: 900,
	[FurnitureType.FLOOR_MIRROR]: 1600,
	[FurnitureType.L_SHAPED_SOFA]: 800,
	[FurnitureType.ROUND_COFFEE_TABLE]: 400,
	[FurnitureType.TABLE]: 750,
	[FurnitureType.ARM_CHAIR_NARROW]: 800,
	[FurnitureType.THREE_SEAT_SOFA_NARROW]: 800,
	[FurnitureType.L_SHAPED_SOFA_RIGHT]: 800,
};

/**
 * Height for a type the table does not list.
 *
 * Waist height: tall enough to read as a piece of furniture, short enough not to hide the room
 * behind it. A new type the app gains shows up as a box of about the right size rather than as
 * nothing at all.
 */
export const DEFAULT_FURNITURE_HEIGHT_MM = 500;

export function furnitureHeightMm(type: number | null | undefined): number {
	if (type == null) return DEFAULT_FURNITURE_HEIGHT_MM;
	return FURNITURE_HEIGHT_MM[type] ?? DEFAULT_FURNITURE_HEIGHT_MM;
}
