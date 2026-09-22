import { describe, expect, it } from "vitest";
import { FLOOR_TEXEL_BUDGET, MAX_FLOOR_SCALE, floorTextureScale } from "./scene";

describe("floorTextureScale", () => {
	it("gives a small map the full scale", () => {
		// At one texel per cell the 1.1-cell vacuum line is a single texel and blurs away on a
		// floor seen at an angle; this is the case the scale exists for.
		expect(floorTextureScale(100, 100, 4096)).toBe(MAX_FLOOR_SCALE);
	});

	it("never goes above the cap, however much the GPU allows", () => {
		expect(floorTextureScale(10, 10, 65536)).toBe(MAX_FLOOR_SCALE);
	});

	it("keeps the texture within the GPU's largest edge", () => {
		const scale = floorTextureScale(1000, 200, 4096);

		expect(scale * 1000).toBeLessThanOrEqual(4096);
	});

	it("keeps the texture within the memory budget on a large flat", () => {
		// A GPU that allows huge textures is not a GPU with memory to spare for one floor.
		const scale = floorTextureScale(600, 600, 16384);

		expect(scale * scale * 600 * 600).toBeLessThanOrEqual(FLOOR_TEXEL_BUDGET);
	});

	it("falls back to one texel per cell rather than zero for an enormous map", () => {
		expect(floorTextureScale(5000, 100, 4096)).toBe(1);
	});

	it("copes with a degenerate map", () => {
		expect(floorTextureScale(0, 0, 4096)).toBeGreaterThanOrEqual(1);
	});
});
