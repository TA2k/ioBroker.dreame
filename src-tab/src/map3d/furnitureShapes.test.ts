import { describe, expect, it } from "vitest";
import { FURNITURE_SHAPES, shapeFor } from "./furnitureShapes";
import { FurnitureType } from "./furniture3d";

describe("shapeFor", () => {
	it("falls back to a single block for a type with no list", () => {
		// A type the app gains later still appears at the right size in the right place.
		expect(shapeFor(999)).toEqual([{ dx: 0, dz: 0, w: 1, d: 1, y0: 0, h: 1 }]);
		expect(shapeFor(null)).toHaveLength(1);
	});

	it("draws a bed as a mattress, a headboard and pillows", () => {
		const single = shapeFor(FurnitureType.SINGLE_BED);
		const double = shapeFor(FurnitureType.DOUBLE_BED);

		// One pillow against three parts, two against four - the only difference between them.
		expect(single).toHaveLength(3);
		expect(double).toHaveLength(4);
	});

	it("gives a bed a headboard taller than the mattress", () => {
		// `y0 + h` above 1 is deliberate: the stated height is the usable surface, not the tallest
		// point, so a headboard has to be allowed to exceed it.
		const tallest = Math.max(...shapeFor(FurnitureType.DOUBLE_BED).map(part => part.y0 + part.h));

		expect(tallest).toBeGreaterThan(1);
	});

	it("gives a table a top and four legs", () => {
		const parts = shapeFor(FurnitureType.DINING_TABLE);

		expect(parts).toHaveLength(5);
		// The top is the part that sits high and spans the whole footprint.
		expect(parts.filter(part => part.y0 > 0.5 && part.w === 1)).toHaveLength(1);
	});

	it("gives seating a back and two arms", () => {
		expect(shapeFor(FurnitureType.THREE_SEAT_SOFA)).toHaveLength(4);
	});

	it("mirrors the two corner sofas rather than drawing them alike", () => {
		const left = shapeFor(FurnitureType.L_SHAPED_SOFA);
		const right = shapeFor(FurnitureType.L_SHAPED_SOFA_RIGHT);

		// The chaise is on opposite sides, so the x offsets are negated between the two.
		expect(left.map(part => part.dx)).toEqual(right.map(part => -part.dx));
	});

	it("uses cylinders where a piece is round", () => {
		expect(shapeFor(FurnitureType.PET_BED).every(part => part.round)).toBe(true);
		expect(shapeFor(FurnitureType.ROUND_COFFEE_TABLE).every(part => part.round)).toBe(true);
		expect(shapeFor(FurnitureType.TOILET).some(part => part.round)).toBe(true);
	});

	it("uses boxes for a piece that is not round", () => {
		expect(shapeFor(FurnitureType.WARDROBE).every(part => !part.round)).toBe(true);
	});
});

describe("FURNITURE_SHAPES", () => {
	const allParts = Object.values(FURNITURE_SHAPES).flat();

	it("covers every furniture type the map can report", () => {
		const missing = Object.values(FurnitureType).filter(type => !(type in FURNITURE_SHAPES));

		expect(missing).toEqual([]);
	});

	it("keeps every part inside its piece's footprint", () => {
		// Fractions outside ±0.5 would put part of a piece outside the outline the robot measured,
		// which is the one thing here that is actually known.
		for (const part of allParts) {
			expect(Math.abs(part.dx) + part.w / 2).toBeLessThanOrEqual(0.5001);
			expect(Math.abs(part.dz) + part.d / 2).toBeLessThanOrEqual(0.5001);
		}
	});

	it("gives every part a positive size", () => {
		for (const part of allParts) {
			expect(part.w).toBeGreaterThan(0);
			expect(part.d).toBeGreaterThan(0);
			expect(part.h).toBeGreaterThan(0);
		}
	});

	it("stands every part on or above the floor", () => {
		for (const part of allParts) expect(part.y0).toBeGreaterThanOrEqual(0);
	});
});
