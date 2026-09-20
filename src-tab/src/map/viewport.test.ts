import { describe, expect, it } from "vitest";
import {
	FITTED,
	MAX_SCALE,
	MIN_SCALE,
	clampPan,
	clampScale,
	isClick,
	isFitted,
	panBy,
	zoomAbout,
} from "./viewport";

describe("clampScale", () => {
	it("keeps the map from shrinking below its container", () => {
		expect(clampScale(0.2)).toBe(MIN_SCALE);
	});

	it("stops where the data has no more detail to show", () => {
		expect(clampScale(999)).toBe(MAX_SCALE);
	});

	it("falls back to fitted for a value that is not a number", () => {
		expect(clampScale(Number.NaN)).toBe(MIN_SCALE);
	});
});

describe("zoomAbout", () => {
	it("zooms about the centre when the cursor is at the centre", () => {
		const view = zoomAbout(FITTED, 2, { x: 0, y: 0 });

		expect(view).toEqual({ scale: 2, x: 0, y: 0 });
	});

	it("holds the point under the cursor still", () => {
		// Cursor 100 px right of centre, zooming from 1 to 2. The map point under it was at
		// 100 map-pixels; after doubling it would be at 200, so the view has to shift back by 100.
		const view = zoomAbout(FITTED, 2, { x: 100, y: 0 });

		expect(view.x).toBe(-100);
	});

	it("still holds it when the view is already panned", () => {
		const start = { scale: 2, x: -100, y: 0 };
		const cursor = { x: 50, y: 0 };

		const view = zoomAbout(start, 4, cursor);

		// The map coordinate under the cursor must be unchanged: (d - x) / s.
		const before = (cursor.x - start.x) / start.scale;
		const after = (cursor.x - view.x) / view.scale;
		expect(after).toBeCloseTo(before, 10);
	});

	it("holds the point on both axes", () => {
		const cursor = { x: 80, y: -40 };
		const view = zoomAbout(FITTED, 3, cursor);

		expect((cursor.x - view.x) / view.scale).toBeCloseTo(cursor.x, 10);
		expect((cursor.y - view.y) / view.scale).toBeCloseTo(cursor.y, 10);
	});

	it("returns the same view when the scale cannot change", () => {
		const view = { scale: MAX_SCALE, x: 5, y: 5 };

		expect(zoomAbout(view, MAX_SCALE * 2, { x: 10, y: 10 })).toBe(view);
	});
});

describe("clampPan", () => {
	const content = { width: 800, height: 400 };

	it("forces the map back to centre once it fits again", () => {
		// Otherwise a stray drag leaves it off-centre with nothing to show that it is.
		expect(clampPan({ scale: 1, x: 120, y: -50 }, content)).toEqual({ scale: 1, x: 0, y: 0 });
	});

	it("allows exactly the overhang and no more", () => {
		// At scale 2 the map is 1600 wide in an 800 container: 400 px of overhang each side.
		expect(clampPan({ scale: 2, x: 5000, y: 0 }, content).x).toBe(400);
		expect(clampPan({ scale: 2, x: -5000, y: 0 }, content).x).toBe(-400);
		expect(clampPan({ scale: 2, x: 0, y: 5000 }, content).y).toBe(200);
	});

	it("leaves an offset within the overhang alone", () => {
		expect(clampPan({ scale: 2, x: 100, y: -50 }, content)).toEqual({ scale: 2, x: 100, y: -50 });
	});
});

describe("panBy", () => {
	it("adds the drag delta", () => {
		expect(panBy({ scale: 2, x: 10, y: 20 }, { x: -5, y: 5 })).toEqual({ scale: 2, x: 5, y: 25 });
	});

	it("leaves the scale alone", () => {
		expect(panBy({ scale: 3, x: 0, y: 0 }, { x: 10, y: 10 }).scale).toBe(3);
	});
});

describe("isFitted", () => {
	it("recognises the untouched view", () => {
		expect(isFitted(FITTED)).toBe(true);
	});

	it("recognises a zoomed or panned view", () => {
		expect(isFitted({ scale: 2, x: 0, y: 0 })).toBe(false);
		expect(isFitted({ scale: 1, x: 10, y: 0 })).toBe(false);
	});
});

describe("isClick", () => {
	it("treats a steady press as a click", () => {
		expect(isClick({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(true);
	});

	it("forgives a few pixels of hand tremor, which a touch screen always has", () => {
		expect(isClick({ x: 100, y: 100 }, { x: 102, y: 101 })).toBe(true);
	});

	it("treats a real drag as a drag", () => {
		expect(isClick({ x: 100, y: 100 }, { x: 140, y: 100 })).toBe(false);
	});
});
