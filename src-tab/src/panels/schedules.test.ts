import { describe, expect, it } from "vitest";
import { formatSettings, parseSchedules, scheduleKind } from "./schedules";
import { parseShortcuts, shortcutName } from "./shortcuts";

const PREFIX = "dreame.0.abc.schedule.";
const SHORTCUT_PREFIX = "dreame.0.abc.shortcuts.";

/** German is the only language the test needs; the keys are what matter. */
const translate = (key: string): string =>
	({ "termine.feuchtigkeit-praefix": "Feuchtigkeit:", "termine.route-praefix": "Route:" })[key] ?? key;

describe("parseSchedules", () => {
	it("assembles one schedule from its scattered states", () => {
		const schedules = parseSchedules(
			{
				[`${PREFIX}1.time`]: "07:30",
				[`${PREFIX}1.weekdays`]: "Mo, Di",
				[`${PREFIX}1.type`]: "Räume",
				[`${PREFIX}1.enabled`]: true,
			},
			PREFIX,
		);

		expect(schedules).toHaveLength(1);
		expect(schedules[0]).toMatchObject({ id: "1", time: "07:30", weekdays: "Mo, Di", enabled: true });
	});

	it("sorts by time of day", () => {
		const schedules = parseSchedules(
			{
				[`${PREFIX}1.time`]: "18:00",
				[`${PREFIX}2.time`]: "06:15",
				[`${PREFIX}3.time`]: "09:45",
			},
			PREFIX,
		);

		expect(schedules.map(schedule => schedule.time)).toEqual(["06:15", "09:45", "18:00"]);
	});

	it("skips the adapter's _backup path, which is not a schedule", () => {
		// It sits directly under `.schedule`, so it has no id segment of its own.
		const schedules = parseSchedules({ [`${PREFIX}_backup`]: "{}", [`${PREFIX}1.time`]: "07:30" }, PREFIX);

		expect(schedules.map(schedule => schedule.id)).toEqual(["1"]);
	});

	it("drops an entry with no time, which is a half-written one", () => {
		expect(parseSchedules({ [`${PREFIX}1.enabled`]: true }, PREFIX)).toEqual([]);
	});

	it("parses the rooms array", () => {
		const rooms = [{ roomName: "Küche", mode: "Saugen", suction: "Stark", cycles: 2 }];
		const schedules = parseSchedules(
			{ [`${PREFIX}1.time`]: "07:30", [`${PREFIX}1.rooms`]: JSON.stringify(rooms) },
			PREFIX,
		);

		expect(schedules[0]?.rooms).toEqual(rooms);
	});

	it("survives malformed JSON without losing the schedule", () => {
		const schedules = parseSchedules({ [`${PREFIX}1.time`]: "07:30", [`${PREFIX}1.rooms`]: "{not json" }, PREFIX);

		expect(schedules).toHaveLength(1);
		expect(schedules[0]?.rooms).toBeUndefined();
	});

	it("ignores states belonging to another device", () => {
		const schedules = parseSchedules(
			{ "dreame.0.other.schedule.1.time": "07:30", [`${PREFIX}2.time`]: "08:00" },
			PREFIX,
		);

		expect(schedules.map(schedule => schedule.id)).toEqual(["2"]);
	});
});

describe("scheduleKind", () => {
	const base = { id: "1", time: "07:30", weekdays: "", typeText: "", enabled: true, orphan: false };

	// The adapter writes `.type` already translated, so it is display text and cannot be branched
	// on. Which fields exist is the reliable indicator - that is the whole point of this function.
	it("detects a room schedule by its rooms array", () => {
		expect(scheduleKind({ ...base, rooms: [] })).toBe("rooms");
	});

	it("detects an all-rooms schedule by its parameters", () => {
		expect(scheduleKind({ ...base, parameters: { mode: "Saugen" } })).toBe("all_rooms");
	});

	it("detects a shortcut schedule by its shortcut id", () => {
		expect(scheduleKind({ ...base, shortcutId: 3 })).toBe("shortcut");
	});

	it("reports nothing when the adapter created none of the three", () => {
		expect(scheduleKind(base)).toBeNull();
	});

	it("is not fooled by the translated type text", () => {
		// "Räume" in German, something else in every other language - hence the field check.
		expect(scheduleKind({ ...base, typeText: "Räume" })).toBeNull();
	});
});

describe("formatSettings", () => {
	it("joins the parts that are present", () => {
		const line = formatSettings({ mode: "Saugen", suction: "Stark", cycles: 2 }, translate);

		expect(line).toBe("Saugen, Stark, 2×");
	});

	it("prints moisture as a bare level, not a percentage", () => {
		// It is a step from 1 to 32. Writing "16 %" claims a percentage the value is not.
		const line = formatSettings({ moisture: 16 }, translate);

		expect(line).toBe("Feuchtigkeit: 16");
		expect(line).not.toContain("%");
	});

	it("prefixes the route", () => {
		expect(formatSettings({ route: "Schnell" }, translate)).toBe("Route: Schnell");
	});

	it("yields an empty string when nothing is set", () => {
		expect(formatSettings({}, translate)).toBe("");
	});
});

describe("parseShortcuts", () => {
	it("assembles shortcuts and reports what is running", () => {
		const shortcuts = parseShortcuts(
			{
				[`${SHORTCUT_PREFIX}1.name`]: "Küche schnell",
				[`${SHORTCUT_PREFIX}1.running`]: false,
				[`${SHORTCUT_PREFIX}2.name`]: "Alles",
				[`${SHORTCUT_PREFIX}2.running`]: true,
			},
			SHORTCUT_PREFIX,
		);

		expect(shortcuts).toEqual([
			{ id: "1", name: "Küche schnell", running: false },
			{ id: "2", name: "Alles", running: true },
		]);
	});

	it("drops a shortcut with no name, which the adapter has not filled yet", () => {
		const shortcuts = parseShortcuts({ [`${SHORTCUT_PREFIX}1.running`]: false }, SHORTCUT_PREFIX);

		expect(shortcuts).toEqual([]);
	});

	it("sorts numerically, so 10 comes after 2", () => {
		const shortcuts = parseShortcuts(
			{
				[`${SHORTCUT_PREFIX}10.name`]: "Ten",
				[`${SHORTCUT_PREFIX}2.name`]: "Two",
			},
			SHORTCUT_PREFIX,
		);

		expect(shortcuts.map(shortcut => shortcut.id)).toEqual(["2", "10"]);
	});

	it("ignores the start trigger, which has nothing to read", () => {
		const shortcuts = parseShortcuts(
			{ [`${SHORTCUT_PREFIX}1.name`]: "A", [`${SHORTCUT_PREFIX}1.start`]: true },
			SHORTCUT_PREFIX,
		);

		expect(shortcuts).toEqual([{ id: "1", name: "A", running: false }]);
	});
});

describe("shortcutName", () => {
	const shortcuts = [{ id: "3", name: "Küche", running: false }];

	it("names a shortcut a schedule points at", () => {
		expect(shortcutName(shortcuts, 3)).toBe("Küche");
	});

	it("returns null for one that no longer exists", () => {
		expect(shortcutName(shortcuts, 9)).toBeNull();
	});
});
