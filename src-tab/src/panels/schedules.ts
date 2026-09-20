/**
 * Schedules, assembled from the flat states the adapter publishes.
 *
 * The adapter writes one state per field under `<did>.schedule.<id>.*` (`main.js`,
 * `parseSchedule`). This turns that scatter back into objects.
 *
 * ## Why the type is detected from the fields, not read from `.type`
 *
 * There is a `.type` state, but the adapter writes it **already translated** - "Räume", not
 * "rooms". It is display text, not a stable tag, so branching on it works in German and silently
 * fails everywhere else. The widget hit exactly this and documents it: the detail rows stayed
 * empty because `type === "rooms"` never matched.
 *
 * What is reliable is which fields exist. The adapter creates `.rooms`, `.parameters` or
 * `.shortcutId` depending on the kind of schedule, and exactly one of the three per entry.
 */

/** Cleaning settings for one room, or for the whole run. */
export interface ScheduleSettings {
	roomName?: string;
	/** Already translated by the adapter. */
	mode?: string;
	suction?: string;
	route?: string;
	cycles?: number;
	/** Wetness level 1..32 - a step, not a percentage. */
	moisture?: number;
}

/** One schedule. */
export interface Schedule {
	id: string;
	/** `HH:MM`, as the adapter writes it. */
	time: string;
	/** Weekday list. Always German from the adapter - a known limitation, not one introduced here. */
	weekdays: string;
	/** Already-translated kind, for display only. */
	typeText: string;
	enabled: boolean;
	/** A shortcut schedule whose shortcut no longer exists. */
	orphan: boolean;
	rooms?: ScheduleSettings[];
	parameters?: ScheduleSettings;
	shortcutId?: number;
}

/** Which kind of schedule this is, decided by which fields the adapter created. */
export type ScheduleKind = "rooms" | "all_rooms" | "shortcut" | null;

export function scheduleKind(schedule: Schedule): ScheduleKind {
	if (Array.isArray(schedule.rooms)) return "rooms";
	if (schedule.parameters) return "all_rooms";
	if (schedule.shortcutId != null) return "shortcut";
	return null;
}

/** Reads a JSON state, or null where it is absent or malformed. */
function parseJson<T>(value: unknown): T | null {
	if (typeof value !== "string" || value === "") return null;
	try {
		return JSON.parse(value) as T;
	} catch {
		return null;
	}
}

/**
 * Builds the schedule list out of raw state values.
 *
 * @param values State id to value, as delivered for the pattern `<prefix>*`.
 * @param prefix e.g. `dreame.0.<did>.schedule.`
 */
export function parseSchedules(values: Readonly<Record<string, unknown>>, prefix: string): Schedule[] {
	const collected = new Map<string, Partial<Schedule>>();

	for (const [id, value] of Object.entries(values)) {
		if (!id.startsWith(prefix)) continue;

		const rest = id.slice(prefix.length).split(".");
		// `_backup` sits directly under `.schedule`, so it has no id segment and is not a schedule.
		if (rest.length !== 2) continue;

		const [scheduleId, field] = rest as [string, string];
		const entry = collected.get(scheduleId) ?? {};

		switch (field) {
			case "time":
			case "weekdays":
				entry[field] = typeof value === "string" ? value : "";
				break;
			case "type":
				entry.typeText = typeof value === "string" ? value : "";
				break;
			case "enabled":
			case "orphan":
				entry[field] = value === true || value === "true" || value === 1;
				break;
			case "shortcutId": {
				const parsed = Number(value);
				if (Number.isFinite(parsed)) entry.shortcutId = parsed;
				break;
			}
			case "rooms": {
				const rooms = parseJson<ScheduleSettings[]>(value);
				if (Array.isArray(rooms)) entry.rooms = rooms;
				break;
			}
			case "parameters": {
				const parameters = parseJson<ScheduleSettings>(value);
				if (parameters) entry.parameters = parameters;
				break;
			}
			default:
				// `raw` and anything added later: the adapter's own debug surface, not shown here.
				break;
		}

		collected.set(scheduleId, entry);
	}

	const schedules: Schedule[] = [];
	for (const [id, entry] of collected) {
		// Without a time there is nothing to show and nothing to sort by - a half-written entry.
		if (!entry.time) continue;
		schedules.push({
			id,
			time: entry.time,
			weekdays: entry.weekdays ?? "",
			typeText: entry.typeText ?? "",
			enabled: entry.enabled ?? false,
			orphan: entry.orphan ?? false,
			...(entry.rooms ? { rooms: entry.rooms } : {}),
			...(entry.parameters ? { parameters: entry.parameters } : {}),
			...(entry.shortcutId != null ? { shortcutId: entry.shortcutId } : {}),
		});
	}

	return schedules.sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * Renders the settings of a room or a run as one line.
 *
 * Moisture is printed as a bare number on purpose. It is a level from 1 to 32, and writing it as
 * "16 %" - which an earlier version of the widget did - claims a percentage the value is not.
 *
 * @param translate Resolves a translation key.
 */
export function formatSettings(
	settings: ScheduleSettings,
	translate: (key: string) => string,
): string {
	return [
		settings.mode,
		settings.suction,
		settings.cycles != null ? `${settings.cycles}×` : null,
		settings.moisture != null ? `${translate("termine.feuchtigkeit-praefix")} ${settings.moisture}` : null,
		settings.route ? `${translate("termine.route-praefix")} ${settings.route}` : null,
	]
		.filter(Boolean)
		.join(", ");
}
