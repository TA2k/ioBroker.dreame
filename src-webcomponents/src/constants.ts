/** Tag of the custom element; a host checks that the module defines exactly this one */
export const TAG = "iob-dreame-robot";

/** The built module, next to its manifest */
export const MODULE_FILE = "dreame-robot.js";

/** The manifest the build writes next to the module; `common.webComponents` names this one */
export const MANIFEST_FILE = "dreame-robot.json";

/** Where `tasks.js` puts the module in the admin folder; the React import is relative to it */
export const MODULE_PATH = `webcomponents/${MODULE_FILE}`;

/** The folder of the furniture pictures, next to the module; written by the build */
export const FURNITURE_DIR = "furniture";

/** The instance a robot is looked for in when none is picked, as the native widgets do */
export const DEFAULT_INSTANCE = "dreame.0";

/**
 * Rooms smaller than this are not labelled - the value of the native views (`MIN_LABELLED_CELLS` in
 * `src-tab/src/components/DreameView.tsx`, which cannot be imported here: it pulls MUI in)
 */
export const MIN_LABELLED_CELLS = 100;

/** What the tile shows: the status, the map, or - `auto` - the map where the box is large enough */
export type RobotContent = "auto" | "status" | "map";

/** How the tile is captioned: by the robot's name, by a text of the user's, or not at all */
export type RobotCaption = "auto" | "custom" | "none";

/** The values of the settings of the manifest; a setting without a value is missing */
export type RobotSettings = {
	/** Object ID of the robot, `dreame.<n>.<did>`; empty for the first robot of `dreame.0` */
	device?: string;
	content?: RobotContent;
	/** Object ID of a floor channel, `dreame.<n>.<did>.map.maps.<map>`; empty to follow the robot */
	floor?: string;
	caption?: RobotCaption;
	captionText?: string;
	/** Start/pause, stop and dock buttons on the tile */
	controls?: boolean;
};

/** The status states the element reads, under `<instance>.<did>.status.` - as `useDeviceStatus` of the views */
export const STATUS_SUFFIX = {
	state: "state",
	battery: "battery-level",
	charging: "charging-status",
	taskStatus: "task-status",
	cleaningPaused: "cleaning-paused",
	cleaningProgress: "cleaning-progress",
	dryingProgress: "drying-progress",
	cleanedArea: "cleaned-area",
	cleaningTime: "cleaning-time",
	robotStatus: "status",
} as const;

export type StatusField = keyof typeof STATUS_SUFFIX;

/** The triggers under `<instance>.<did>.remote.` the buttons write `true` to, as the admin tab does */
export const COMMANDS = {
	start: "startCleaning",
	pause: "pause",
	stop: "stop",
	dock: "return-to-dock",
} as const;

export type RobotCommand = keyof typeof COMMANDS;

/**
 * A number out of a state value, or null - `asNumber` of the views (`src-tab/src/connection/useStates.ts`),
 * which is not imported: that module reaches the socket types of gui-components
 *
 * @param value the value of a state
 */
export function asNumber(value: unknown): number | null {
	if (value == null || value === "") {
		return null;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

/** The firmware's "position unknown" */
const UNKNOWN_POSITION = 32767;

/**
 * A position state, `map.robot` or `map.charger`: a JSON pair `[x, y]` in world millimetres - `parsePosition` of
 * the views (`src-tab/src/map/useLivePositions.ts`, which is a hook over the views' socket layer)
 *
 * @param value the value of the state
 */
export function parsePosition(value: unknown): { x: number; y: number } | null {
	let parsed: unknown = value;
	if (typeof value === "string") {
		try {
			parsed = JSON.parse(value);
		} catch {
			return null;
		}
	}
	if (!Array.isArray(parsed) || parsed.length < 2) {
		return null;
	}
	const x = Number(parsed[0]);
	const y = Number(parsed[1]);
	if (!Number.isFinite(x) || !Number.isFinite(y)) {
		return null;
	}
	if (Math.abs(x) === UNKNOWN_POSITION || Math.abs(y) === UNKNOWN_POSITION) {
		return null;
	}
	return { x, y };
}

/**
 * The size of the robot marker in map cells: 3.7 % of the map's width within 7 to 14 cells, the charger 1.2 times
 * that - Home Assistant's rule, as `markerSizes` of the views (`src-tab/src/map/markers.ts`) ports it
 *
 * @param width the width of the map in cells
 */
export function markerSizes(width: number): { robot: number; charger: number } {
	const robot = Math.max(7, Math.min(14, width * 0.037));
	return { robot, charger: robot * 1.2 };
}
