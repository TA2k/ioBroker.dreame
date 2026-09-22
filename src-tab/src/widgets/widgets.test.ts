import { describe, expect, it } from "vitest";
import { dialogTitle, resolveTileContent, tileCaption } from "./tileContent";
import { parseDeviceObjectId, parseFloorObjectId } from "../devices/deviceRef";
import { LIVE_FLOOR } from "../floors/floors";

describe("resolveTileContent", () => {
	it("shows the map on the one square tile large enough for it", () => {
		expect(resolveTileContent("auto", "2x2")).toBe("map");
	});

	it("shows the status on every smaller tile", () => {
		expect(resolveTileContent("auto", "1x1")).toBe("status");
		expect(resolveTileContent("auto", "2x1")).toBe("status");
		expect(resolveTileContent("auto", "2x0.5")).toBe("status");
	});

	it("treats a missing setting as auto", () => {
		expect(resolveTileContent(undefined, "2x2")).toBe("map");
		expect(resolveTileContent(undefined, undefined)).toBe("status");
	});

	it("honours an explicit choice whatever the size", () => {
		expect(resolveTileContent("map", "1x1")).toBe("map");
		expect(resolveTileContent("status", "2x2")).toBe("status");
	});
});

describe("parseDeviceObjectId", () => {
	it("reads instance and device from a picked robot", () => {
		expect(parseDeviceObjectId("dreame.0.abc123")).toEqual({ instanceId: "dreame.0", did: "abc123" });
		expect(parseDeviceObjectId("dreame.2.xyz")).toEqual({ instanceId: "dreame.2", did: "xyz" });
	});

	it("refuses a device of another adapter picked by mistake", () => {
		expect(parseDeviceObjectId("shelly.0.SHSW-1#1")).toBeNull();
	});

	it("refuses a state or channel below the robot rather than guessing its device", () => {
		expect(parseDeviceObjectId("dreame.0.abc.status.state")).toBeNull();
	});

	it("refuses nothing picked", () => {
		expect(parseDeviceObjectId("")).toBeNull();
		expect(parseDeviceObjectId(undefined)).toBeNull();
	});
});

describe("parseFloorObjectId", () => {
	it("reads the floor from a picked map channel", () => {
		expect(parseFloorObjectId("dreame.0.abc.map.maps.5")).toBe("5");
	});

	it("follows the robot when nothing is picked", () => {
		expect(parseFloorObjectId("")).toBe(LIVE_FLOOR);
		expect(parseFloorObjectId(null)).toBe(LIVE_FLOOR);
	});

	it("follows the robot for the adapter's `current` alias", () => {
		expect(parseFloorObjectId("dreame.0.abc.map.maps.current")).toBe(LIVE_FLOOR);
	});

	it("follows the robot for anything that is not a floor channel", () => {
		expect(parseFloorObjectId("dreame.0.abc.map.maps.5.image")).toBe(LIVE_FLOOR);
		expect(parseFloorObjectId("dreame.0.abc")).toBe(LIVE_FLOOR);
	});
});

describe("tileCaption", () => {
	it("names the robot automatically, and the floor as well where the tile is pinned to one", () => {
		expect(tileCaption("auto", undefined, "X40", null)).toBe("X40");
		expect(tileCaption("auto", undefined, "X40", "Upstairs")).toBe("X40 · Upstairs");
	});

	it("treats a missing setting as automatic", () => {
		expect(tileCaption(undefined, "ignored", "X40", null)).toBe("X40");
	});

	it("shows a custom text as it is given, trimmed", () => {
		expect(tileCaption("custom", "  Downstairs  ", "X40", "Ground floor")).toBe("Downstairs");
	});

	it("falls back to the automatic caption while the custom text is empty", () => {
		expect(tileCaption("custom", "", "X40", null)).toBe("X40");
		expect(tileCaption("custom", "   ", "X40", "Upstairs")).toBe("X40 · Upstairs");
		expect(tileCaption("custom", undefined, "X40", null)).toBe("X40");
	});

	it("shows nothing when the caption is switched off", () => {
		expect(tileCaption("none", "Downstairs", "X40", "Upstairs")).toBeNull();
	});
});

describe("dialogTitle", () => {
	it("is the custom caption where the user wrote one", () => {
		expect(dialogTitle("custom", " Downstairs ", "X40")).toBe("Downstairs");
	});

	it("is the robot's name otherwise, without a floor and even with the caption switched off", () => {
		expect(dialogTitle("auto", "ignored", "X40")).toBe("X40");
		expect(dialogTitle("custom", "  ", "X40")).toBe("X40");
		expect(dialogTitle("none", "Downstairs", "X40")).toBe("X40");
		expect(dialogTitle(undefined, undefined, "X40")).toBe("X40");
	});
});
