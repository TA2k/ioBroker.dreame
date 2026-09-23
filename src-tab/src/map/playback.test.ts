import { describe, expect, it } from "vitest";
import {
	MAX_DRIVE_MM,
	TrailPlayback,
	commonPrefix,
	cumulativeDistances,
	headAfterUpdate,
	interpolateHeading,
	positionAt,
	shortestTurn,
} from "./playback";
import { badgeBox, markerSizes, robotBadge, stationBadge } from "./markers";
import type { MarkerStatus } from "./markers";
import type { PathPoint } from "./mapPackage";
import { parsePosition } from "./useLivePositions";

// A run along x: start, then two straight 100 mm steps.
const run: PathPoint[] = [
	[0, 0, 1],
	[100, 0, 0],
	[200, 0, 0],
];

describe("trail geometry", () => {
	it("measures the distance along the trail, repositioning moves included", () => {
		expect(cumulativeDistances(run)).toEqual([0, 100, 200]);
		expect(
			cumulativeDistances([
				[0, 0, 1],
				[0, 300, 1],
			]),
		).toEqual([0, 300]);
	});

	it("finds the position and direction of travel at a distance", () => {
		const d = cumulativeDistances(run);
		expect(positionAt(run, d, 150)).toEqual({ x: 150, y: 0, index: 2, heading: 0, onBreak: false });
		expect(positionAt(run, d, 0)).toMatchObject({ x: 0, y: 0, heading: null });
		// North is +y in the world, so 90 degrees.
		const up: PathPoint[] = [
			[0, 0, 1],
			[0, 100, 0],
		];
		expect(positionAt(up, cumulativeDistances(up), 50)?.heading).toBe(90);
	});

	it("marks a repositioning move, which is driven but not drawn", () => {
		const jump: PathPoint[] = [
			[0, 0, 1],
			[100, 0, 1],
		];
		expect(positionAt(jump, cumulativeDistances(jump), 50)?.onBreak).toBe(true);
	});

	it("counts the points two trails share from the start", () => {
		expect(commonPrefix(run, [...run, [300, 0, 0]])).toBe(3);
		expect(commonPrefix(run, [[5, 0, 1]])).toBe(0);
	});
});

describe("headAfterUpdate", () => {
	const longer: PathPoint[] = [...run, [300, 0, 0]];

	it("stays where it is and plays the new piece", () => {
		expect(headAfterUpdate(run, 200, longer, cumulativeDistances(longer))).toBe(200);
	});

	it("jumps to the end of the very first trail instead of racing through it", () => {
		expect(headAfterUpdate([], 0, longer, cumulativeDistances(longer))).toBe(300);
	});

	it("starts a trail sharing nothing with the old one - a new job - from its beginning", () => {
		const fresh: PathPoint[] = [
			[1000, 1000, 1],
			[1100, 1000, 0],
		];
		expect(headAfterUpdate(run, 200, fresh, cumulativeDistances(fresh))).toBe(0);
	});

	it("jumps where the new piece is too long to drive", () => {
		const far: PathPoint[] = [...run, [200 + MAX_DRIVE_MM + 1, 0, 0]];
		const d = cumulativeDistances(far);
		expect(headAfterUpdate(run, 200, far, d)).toBe(d[d.length - 1]);
	});
});

describe("headings", () => {
	it("turns the short way round", () => {
		expect(shortestTurn(170, -170)).toBe(20);
		expect(shortestTurn(-170, 170)).toBe(-20);
		expect(interpolateHeading(350, 10, 0.5)).toBe(360);
		expect(interpolateHeading(null, 10, 0.5)).toBe(10);
	});
});

describe("TrailPlayback", () => {
	const longer: PathPoint[] = [...run, [300, 0, 0]];

	it("draws the whole first trail at once and puts the robot where it was reported", () => {
		const playback = new TrailPlayback();
		playback.feed(run, 0, 0);
		playback.report({ x: 200, y: 0 }, 0, 0);
		expect(playback.frame(0)).toEqual({ head: 200, robot: { x: 200, y: 0, heading: 0 }, cut: null, moving: false });
	});

	it("plays a new piece: the trail stops at the robot, which drives along it", () => {
		const playback = new TrailPlayback();
		playback.feed(run, 0, 0);
		playback.feed(longer, 0, 3000);

		const halfway = playback.frame(3000 + 1500);
		expect(halfway.moving).toBe(true);
		expect(halfway.head).toBeCloseTo(250);
		expect(halfway.robot).toMatchObject({ x: 250, y: 0 });
		expect(halfway.cut).toEqual({ lastIndex: 2, head: { x: 250, y: 0, index: 3 } });

		const done = playback.frame(3000 + 3000 + 1000);
		expect(done).toMatchObject({ head: 300, cut: null, moving: false });
	});

	it("leaves the marker to the playhead while it plays", () => {
		const playback = new TrailPlayback();
		playback.feed(run, 0, 0);
		playback.feed(longer, 0, 3000);
		playback.report({ x: 900, y: 900 }, 0, 3100);
		expect(playback.frame(3100 + 100).robot).toMatchObject({ y: 0 });
	});

	it("glides between reported positions where there is no trail to play", () => {
		const playback = new TrailPlayback();
		playback.report({ x: 0, y: 0 }, 0, 0);
		playback.report({ x: 1000, y: 0 }, 0, 0);
		expect(playback.frame(1500)).toMatchObject({ robot: { x: 500, y: 0, heading: 0 }, moving: true });
		expect(playback.frame(3000)).toMatchObject({ robot: { x: 1000, y: 0 }, moving: false });
	});

	it("faces backwards when the reported heading says the robot reverses", () => {
		const playback = new TrailPlayback();
		playback.report({ x: 0, y: 0 }, 180, 0);
		// Travels towards +x, but reports facing -x: it is reversing, as when parking.
		playback.report({ x: 1000, y: 0 }, 180, 0);
		expect(playback.frame(3000).robot?.heading).toBe(180);
	});
});

describe("marker badges", () => {
	const idle: MarkerStatus = {
		robotStatus: 0,
		state: 13,
		charging: 0,
		washStatus: 0,
		emptyStatus: 0,
		hotWater: 0,
	};

	it("marks a fault ahead of everything else", () => {
		expect(robotBadge({ ...idle, robotStatus: 12, charging: 1 })?.icon).toBe("warning");
	});

	it("marks cleaning, charging and sleeping, in that order", () => {
		expect(robotBadge({ ...idle, robotStatus: 18, charging: 1 })?.icon).toBe("cleaning");
		expect(robotBadge({ ...idle, state: 6 })?.icon).toBe("charging");
		expect(robotBadge({ ...idle, state: 1, robotStatus: 14 })).toEqual({ icon: "sleeping", placement: "corner" });
		expect(robotBadge({ ...idle, state: 1 })).toBeNull();
	});

	it("marks the station's emptying, washing and drying, hot where the water is", () => {
		expect(stationBadge({ ...idle, emptyStatus: 1 })?.icon).toBe("emptying");
		expect(stationBadge({ ...idle, washStatus: 1 })?.icon).toBe("washing");
		expect(stationBadge({ ...idle, washStatus: 1, hotWater: 1 })?.icon).toBe("hotWashing");
		expect(stationBadge({ ...idle, washStatus: 2, hotWater: 1 })?.icon).toBe("hotDrying");
		expect(stationBadge(idle)).toBeNull();
	});

	it("lets drying the dust bag outrank a wash, as the widget does", () => {
		expect(stationBadge({ ...idle, washStatus: 1, state: 35 })?.icon).toBe("dustBagDrying");
	});

	it("sizes markers by the map, within Home Assistant's bounds", () => {
		expect(markerSizes(100, 400)).toEqual({ robot: 7, charger: 7 * 1.2 });
		expect(markerSizes(1000, 400).robot).toBe(14);
		expect(markerSizes(300, 100, 90).robot).toBe(7);
		expect(badgeBox("above", 10)).toEqual({ x: -4.5, y: -12.5, size: 9 });
	});
});

describe("parsePosition", () => {
	it("reads the adapter's JSON pair and rejects the firmware's unknown position", () => {
		expect(parsePosition("[-2194,-397]")).toEqual({ x: -2194, y: -397 });
		expect(parsePosition([1, 2])).toEqual({ x: 1, y: 2 });
		expect(parsePosition("[32767,5]")).toBeNull();
		expect(parsePosition("nonsense")).toBeNull();
		expect(parsePosition(null)).toBeNull();
	});
});
