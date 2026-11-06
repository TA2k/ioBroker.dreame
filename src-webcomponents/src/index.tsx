/**
 * A Dreame robot as a web component: `<iob-dreame-robot>`.
 *
 * One module for every host - vis-2, devices, Aura, admin (`@iobroker/web-components`). Its manifest is a file of
 * its own (`dreame-robot.json`, written by the build from `manifest.ts`), so a host loads this module only when it
 * shows the element. The host sets `socket` and `settings`, and if it has them `theme`, `editMode` and `dialogs`.
 *
 * What it shows is what the native widgets show (`src-widgets/src/DreameRobot.tsx`,
 * `src-devices/src/DreameRobotComponent.tsx`): the robot's status, or the map of a floor, or - `auto` - whichever
 * fits the box; a click opens a larger view in a dialog of the host. It adds the three buttons of the full view's
 * status panel: start or pause, stop, back to the dock.
 *
 * Everything comes from states of the adapter, as in the native views: the status under `<did>.status.`, the map
 * package `<did>.map.mergedCloud`, the live positions `<did>.map.robot` and `.charger`, the stored floors under
 * `<did>.map.maps.<map>`, the robots' names in `info.devices`. The buttons write `true` to the triggers under
 * `<did>.remote.`. The map is decoded and drawn by the pure modules of the views, compiled in.
 *
 * React is not in the module: it comes from `lib/esm/react-19.js` beside `adapter/`, see `vite.config.ts`.
 */
import { createRoot, type Root } from "react-dom/client";

import { defineWebComponent, getThemeCssVariables, IobWebComponent } from "@iobroker/web-components/element";

import { parseDeviceList } from "../../src-tab/src/devices/deviceList";
import { parseDeviceObjectId, parseFloorObjectId, type DeviceRef } from "../../src-tab/src/devices/deviceRef";
import { floorSource, LIVE_FLOOR } from "../../src-tab/src/floors/floors";
import { decodeMapPackage, type MapPackage } from "../../src-tab/src/map/mapPackage";
import { collectRooms, labelRooms, type LabelledRoom } from "../../src-tab/src/map/rooms";
import { DRYING_STATES, isStarted, isWorking, statusTextKey } from "../../src-tab/src/status/statusCodes";
import { dialogTitle, tileCaption } from "../../src-tab/src/widgets/tileContent";

import {
	asNumber,
	COMMANDS,
	DEFAULT_INSTANCE,
	MIN_LABELLED_CELLS,
	parsePosition,
	STATUS_SUFFIX,
	TAG,
	type RobotCommand,
	type RobotContent,
	type RobotSettings,
	type StatusField,
} from "./constants";
import { getWords, type Words } from "./i18n";
import { Hint, RobotDetail, RobotTile, type MapData, type RobotValues } from "./RobotView";
import { STYLES } from "./styles";

/** How long a failed command is shown */
const FAILURE_MS = 6000;

const CONTENTS: RobotContent[] = ["auto", "status", "map"];

function getContent(settings: RobotSettings): RobotContent {
	return CONTENTS.includes(settings.content as RobotContent) ? (settings.content as RobotContent) : "auto";
}

/** The decoded map package, kept for the value of `map.mergedCloud` it was decoded from */
interface DecodedMap {
	value: unknown;
	map: MapPackage | null;
	error: string | null;
	/** The newest value is still being decoded */
	pending: boolean;
}

/** The IDs of the states of one robot */
function robotIds(device: DeviceRef): {
	status: Record<StatusField, string>;
	map: string;
	robot: string;
	charger: string;
	floor: (floorId: string, name: "mapName" | "image") => string;
	command: (command: RobotCommand) => string;
} {
	const prefix = `${device.instanceId}.${device.did}`;
	const status = {} as Record<StatusField, string>;
	for (const field of Object.keys(STATUS_SUFFIX) as StatusField[]) {
		status[field] = `${prefix}.status.${STATUS_SUFFIX[field]}`;
	}
	return {
		status,
		map: `${prefix}.map.mergedCloud`,
		robot: `${prefix}.map.robot`,
		charger: `${prefix}.map.charger`,
		floor: (floorId, name) => `${prefix}.map.maps.${floorId}.${name}`,
		command: command => `${prefix}.remote.${COMMANDS[command]}`,
	};
}

class DreameRobotElement extends IobWebComponent<RobotSettings> {
	readonly #root: Root;

	/** What `getStateIds` subscribed for: the robot, and whether the map was wanted */
	#subscribedFor = "";

	#decoded: DecodedMap = { value: undefined, map: null, error: null, pending: false };

	/** Counts the decodes, so that a slow one of an older package never replaces a newer map */
	#generation = 0;

	#rooms: { map: MapPackage | null; lang: string; rooms: LabelledRoom[] } = { map: null, lang: "", rooms: [] };

	#failure: string | null = null;

	#failureTimer: ReturnType<typeof setTimeout> | null = null;

	/** Draws the open dialog again; null while none is open */
	#drawDialog: (() => void) | null = null;

	constructor() {
		super();
		const shadow = this.attachShadow({ mode: "open" });
		const style = document.createElement("style");
		style.textContent = STYLES;
		const mount = document.createElement("div");
		mount.className = "mount";
		shadow.append(style, mount);
		this.#root = createRoot(mount);
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		if (this.#failureTimer) {
			clearTimeout(this.#failureTimer);
			this.#failureTimer = null;
		}
		this.#failure = null;
	}

	/**
	 * The robot of the settings: the one picked, else - as the native widgets do - the first robot of `dreame.0`,
	 * found in its `info.devices`. Null if there is none, or if what was picked is no robot.
	 */
	#getDevice(settings: RobotSettings): DeviceRef | null {
		if (settings.device) {
			return parseDeviceObjectId(settings.device);
		}
		const first = parseDeviceList(this.states[`${DEFAULT_INSTANCE}.info.devices`]?.val)[0];
		return first ? { instanceId: DEFAULT_INSTANCE, did: first.did } : null;
	}

	/** The map is read where the tile may show it, and while the dialog - which always shows it - is open */
	#wantsMap(settings: RobotSettings): boolean {
		return getContent(settings) !== "status" || !!this.#drawDialog;
	}

	#subscriptionKey(settings: RobotSettings): string {
		const device = this.#getDevice(settings);
		return device ? `${device.instanceId}.${device.did}|${this.#wantsMap(settings)}` : "";
	}

	protected override getStateIds(settings: RobotSettings): string[] {
		this.#subscribedFor = this.#subscriptionKey(settings);
		const device = this.#getDevice(settings);
		// the names of the robots, and the first robot where none is picked
		const ids = [`${device?.instanceId || DEFAULT_INSTANCE}.info.devices`];
		if (!device) {
			return ids;
		}
		const robot = robotIds(device);
		ids.push(...Object.values(robot.status));
		if (this.#wantsMap(settings)) {
			ids.push(robot.map, robot.robot, robot.charger);
			const floor = parseFloorObjectId(settings.floor);
			if (floor !== LIVE_FLOOR) {
				ids.push(robot.floor(floor, "mapName"), robot.floor(floor, "image"));
			}
		}
		return ids;
	}

	/**
	 * Asks `getStateIds` again: the base class does so whenever the settings are set. Needed where the states follow
	 * from something other than the settings - the first robot found in `info.devices`, the dialog opened or closed
	 */
	#resubscribe(): void {
		// eslint-disable-next-line no-self-assign
		this.settings = this.settings;
	}

	/** Decodes a new value of `map.mergedCloud`; draws again when it is done */
	#decode(value: unknown): void {
		if (value === this.#decoded.value) {
			return;
		}
		if (typeof value !== "string" || !value) {
			this.#generation++;
			this.#decoded = { value, map: null, error: null, pending: false };
			return;
		}
		const generation = ++this.#generation;
		// the old map stays until the new one is ready: no flicker while the robot cleans
		this.#decoded = { ...this.#decoded, value, pending: true };
		decodeMapPackage(value).then(
			map => {
				if (generation === this.#generation) {
					this.#decoded = { value, map, error: null, pending: false };
					this.#draw();
				}
			},
			(error: unknown) => {
				if (generation === this.#generation) {
					const message = error instanceof Error ? error.message : String(error);
					this.#decoded = { value, map: null, error: message, pending: false };
					this.#draw();
				}
			},
		);
	}

	/** The rooms of a map with their names, worked out once per map and language */
	#getRooms(map: MapPackage, words: Words, lang: string): LabelledRoom[] {
		if (this.#rooms.map !== map || this.#rooms.lang !== lang) {
			this.#rooms = {
				map,
				lang,
				rooms: labelRooms(collectRooms(map, { minCells: MIN_LABELLED_CELLS }), words.view),
			};
		}
		return this.#rooms.rooms;
	}

	#getValues(device: DeviceRef, words: Words, settings: RobotSettings, floorName: string | null): RobotValues {
		const robot = robotIds(device);
		const value = (field: StatusField): unknown => this.states[robot.status[field]]?.val;
		const state = asNumber(value("state"));
		const key = statusTextKey(state);
		const time = asNumber(value("cleaningTime"));
		const drying = asNumber(value("dryingProgress"));
		const working = isWorking(state);
		const names = parseDeviceList(this.states[`${device.instanceId}.info.devices`]?.val);
		const robotName = names.find(entry => entry.did === device.did)?.name || device.did;

		return {
			caption: tileCaption(settings.caption, settings.captionText, robotName, floorName),
			stateText: key
				? words.view(key)
				: state != null
					? `${words.view("panel.kopf.status.unbekannter-code-praefix")} ${state}`
					: "–",
			working,
			started: isStarted(
				asNumber(value("taskStatus")),
				asNumber(value("robotStatus")),
				Boolean(value("cleaningPaused")),
			),
			// state 4 is "error"; status 12 is Home Assistant's error status
			error: state === 4 || asNumber(value("robotStatus")) === 12,
			battery: asNumber(value("battery")),
			charging: asNumber(value("charging")) === 1,
			progress: asNumber(value("cleaningProgress")),
			area: asNumber(value("cleanedArea")),
			details: [
				working && time != null && time > 0 ? `${time} min` : null,
				state != null && DRYING_STATES.has(state) && drying != null && drying > 0
					? `${words.view("panel.kopf.trocknung-praefix")} ${drying} %`
					: null,
			].filter((detail): detail is string => !!detail),
		};
	}

	#getMap(device: DeviceRef, words: Words, floor: string): MapData {
		const robot = robotIds(device);
		const mapState = this.states[robot.map];
		// not read yet
		if (mapState === undefined) {
			return { kind: "loading" };
		}
		this.#decode(mapState?.val);
		const { map, error, pending } = this.#decoded;

		const source = floorSource(floor, map?.header.mapId ?? null, `${device.instanceId}.${device.did}.map.maps.`);
		if (source.kind === "image") {
			const src = this.states[source.stateId]?.val;
			// the adapter stores pictures of other floors only with "fetch all maps" in its settings
			return typeof src === "string" && src.startsWith("data:image/")
				? { kind: "image", src, caption: words.view("tab.floor.gespeichert") }
				: { kind: "message", text: words.view("tab.floor.keinBild") };
		}
		if (map && source.kind === "live") {
			return {
				kind: "live",
				map,
				rooms: this.#getRooms(map, words, this.systemLang),
				robot: parsePosition(this.states[robot.robot]?.val),
				charger: parsePosition(this.states[robot.charger]?.val),
			};
		}
		if (pending) {
			return { kind: "loading" };
		}
		// no map yet is normal on a fresh installation: the adapter publishes one after its first cloud poll
		return { kind: "message", text: words.view(error ? "tab.mapError" : "tab.noMap") };
	}

	#command(device: DeviceRef, command: RobotCommand): void {
		if (this.editMode) {
			return;
		}
		// a write can be refused; a button that silently does nothing is worse than an error
		this.setState(robotIds(device).command(command), true).catch((error: unknown) => {
			this.#showFailure(error instanceof Error ? error.message : String(error));
		});
	}

	#showFailure(text: string): void {
		this.#failure = text;
		if (this.#failureTimer) {
			clearTimeout(this.#failureTimer);
		}
		this.#failureTimer = setTimeout(() => {
			this.#failureTimer = null;
			this.#failure = null;
			this.#draw();
		}, FAILURE_MS);
		this.#draw();
	}

	/** The larger view in an element dialog of the host, drawn again with every change of a state */
	async #openDialog(device: DeviceRef, title: string): Promise<void> {
		if (this.editMode || this.#drawDialog) {
			return;
		}
		const element = document.createElement("div");
		// the host moves the content into its dialog, out of this element: it takes the theme along
		for (const [name, value] of Object.entries(getThemeCssVariables(this.theme))) {
			element.style.setProperty(name, value);
		}
		element.style.display = "block";
		element.style.height = "min(70vh, 620px)";
		const shadow = element.attachShadow({ mode: "open" });
		const style = document.createElement("style");
		style.textContent = STYLES;
		const mount = document.createElement("div");
		mount.className = "dialog-root";
		shadow.append(style, mount);
		const root = createRoot(mount);

		this.#drawDialog = () => {
			const settings = this.settings;
			const current = this.#getDevice(settings);
			if (!current || current.instanceId !== device.instanceId || current.did !== device.did) {
				// another robot was picked meanwhile: the dialog shows the one it was opened for until it is closed
				root.render(null);
				return;
			}
			const words = getWords(this.systemLang);
			const floor = getContent(settings) === "status" ? LIVE_FLOOR : parseFloorObjectId(settings.floor);
			root.render(
				<RobotDetail
					values={this.#getValues(device, words, settings, null)}
					map={this.#getMap(device, words, floor)}
					editMode={this.editMode}
					words={words}
					failure={this.#failure}
					onCommand={command => this.#command(device, command)}
				/>,
			);
		};
		// a status tile reads no map: now it does, while the dialog is open
		this.#resubscribe();
		try {
			await this.openDialog({ title, element, width: 960 });
		} finally {
			this.#drawDialog = null;
			root.unmount();
			if (this.isConnected) {
				this.#resubscribe();
			}
		}
	}

	/** Draws now, outside the cycle of the base class - after a decode or a failure; only while in the document */
	#draw(): void {
		if (this.isConnected) {
			this.render();
		}
	}

	protected override render(): void {
		const settings = this.settings;
		const lang = this.systemLang;
		const words = getWords(lang);

		// the first robot of dreame.0 has arrived, or another one is first now: subscribe its states
		if (this.socket && this.#subscriptionKey(settings) !== this.#subscribedFor) {
			this.#resubscribe();
		}

		const device = this.#getDevice(settings);
		if (!device) {
			this.#root.render(<Hint text={words.own(settings.device ? "notRobot" : "noRobot")} editMode={this.editMode} />);
			this.#drawDialog?.();
			return;
		}

		const content = getContent(settings);
		const floor = content === "status" ? LIVE_FLOOR : parseFloorObjectId(settings.floor);
		// only a map is pinned to a floor; the status is the robot's wherever it is
		const floorNameState = floor !== LIVE_FLOOR ? this.states[robotIds(device).floor(floor, "mapName")]?.val : null;
		const floorName =
			floor === LIVE_FLOOR
				? null
				: typeof floorNameState === "string" && floorNameState
					? floorNameState
					: `Map ${floor}`;
		const values = this.#getValues(device, words, settings, floorName);
		const names = parseDeviceList(this.states[`${device.instanceId}.info.devices`]?.val);
		const robotName = names.find(entry => entry.did === device.did)?.name || device.did;
		const title = dialogTitle(settings.caption, settings.captionText, robotName);

		this.#root.render(
			<RobotTile
				content={content}
				values={values}
				map={content === "status" ? { kind: "loading" } : this.#getMap(device, words, floor)}
				controls={settings.controls !== false}
				editMode={this.editMode}
				words={words}
				failure={this.#failure}
				onCommand={command => this.#command(device, command)}
				onOpen={() => void this.#openDialog(device, title)}
			/>,
		);
		this.#drawDialog?.();
	}
}

defineWebComponent(TAG, DreameRobotElement);
