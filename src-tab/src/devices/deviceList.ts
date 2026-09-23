/**
 * Reads and tracks the devices an adapter instance has found.
 *
 * The adapter publishes them as a JSON array in `dreame.<instance>.info.devices` (written in
 * `main.js`, `setStateAsync('info.devices', ...)`). It is the one place that knows which robots
 * exist, so it is also what decides which device the tab can show.
 *
 * This module is deliberately free of React: it is a small state machine over one state, and
 * keeping it that way means the device-switching rules can be tested directly rather than through
 * a rendered component.
 */

import type { StateHandler, TabConnection } from "../connection/types";

/** One device, as `info.devices` describes it. */
export interface DreameDevice {
	/** Device id; the segment every per-device state sits under. */
	did: string;
	name: string;
	/** `vacuum` or `mower`. Decides which panels apply. */
	typ: string;
}

/** Called when the list, the selection, or both have changed. */
export type DeviceListListener = (snapshot: DeviceListSnapshot) => void;

/** What the tab needs to render a device switcher. */
export interface DeviceListSnapshot {
	devices: DreameDevice[];
	/** Currently selected device, or null while none is known. */
	selected: DreameDevice | null;
}

/**
 * Parses the state value.
 *
 * Anything that is not an array of objects carrying a `did` is dropped rather than passed on:
 * a half-written or malformed list should leave the tab with no device, which it can report,
 * instead of an entry whose states do not exist.
 */
export function parseDeviceList(raw: unknown): DreameDevice[] {
	if (typeof raw !== "string" || raw.length === 0) return [];

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];

	const devices: DreameDevice[] = [];
	for (const entry of parsed) {
		const did = (entry as { did?: unknown })?.did;
		if (typeof did !== "string" || did.length === 0) continue;
		const name = (entry as { name?: unknown })?.name;
		const typ = (entry as { typ?: unknown })?.typ;
		devices.push({
			did,
			name: typeof name === "string" && name.length > 0 ? name : did,
			typ: typeof typ === "string" ? typ : "vacuum",
		});
	}
	return devices;
}

/**
 * Picks the device to show.
 *
 * A `?did=` in the tab's own URL wins where it names a device that is actually present, so a
 * bookmarked or embedded tab opens on the robot it was pointed at. Otherwise the first entry
 * wins, which is what the existing widget does (`www/js/core/geraete.js`).
 */
export function chooseDevice(devices: DreameDevice[], requestedDid: string | null): DreameDevice | null {
	if (requestedDid) {
		const requested = devices.find(device => device.did === requestedDid);
		if (requested) return requested;
	}
	return devices[0] ?? null;
}

/** Tracks `info.devices` for one adapter instance. */
export class DeviceList {
	private devices: DreameDevice[] = [];
	private selectedDid: string | null = null;
	private readonly listeners = new Set<DeviceListListener>();
	private readonly stateId: string;
	private handler: StateHandler | null = null;

	/**
	 * @param connection How to reach ioBroker.
	 * @param instanceId Adapter instance, e.g. `dreame.0`.
	 * @param requestedDid Device from the tab's URL, or null.
	 */
	public constructor(
		private readonly connection: TabConnection,
		instanceId: string,
		private readonly requestedDid: string | null = null,
	) {
		this.stateId = `${instanceId}.info.devices`;
	}

	/** Loads the list once and stays subscribed to it. */
	public async start(): Promise<DeviceListSnapshot> {
		const state = await this.connection.getState(this.stateId);
		this.apply(parseDeviceList(state?.val));

		this.handler = (_id, changed) => {
			this.apply(parseDeviceList(changed?.val));
			this.publish();
		};
		await this.connection.subscribe(this.stateId, this.handler);

		return this.snapshot();
	}

	/** Drops the subscription. Safe to call when `start` never ran. */
	public stop(): void {
		if (this.handler) {
			this.connection.unsubscribe(this.stateId, this.handler);
			this.handler = null;
		}
		this.listeners.clear();
	}

	/** Switches device, ignoring anything not in the current list. */
	public select(did: string): void {
		if (did === this.selectedDid) return;
		if (!this.devices.some(device => device.did === did)) return;
		this.selectedDid = did;
		this.publish();
	}

	public snapshot(): DeviceListSnapshot {
		return {
			devices: this.devices,
			selected: this.devices.find(device => device.did === this.selectedDid) ?? null,
		};
	}

	/** Subscribes to changes. Returns the function that unsubscribes again. */
	public onChange(listener: DeviceListListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * Takes a new list, keeping the selection where that is still possible.
	 *
	 * A device that disappears has to give up the selection - leaving it would show a robot whose
	 * states no longer exist - but a device that merely moved in the list keeps it, so an unrelated
	 * change elsewhere does not switch the user's view out from under them.
	 */
	private apply(devices: DreameDevice[]): void {
		this.devices = devices;
		if (!this.selectedDid || !devices.some(device => device.did === this.selectedDid)) {
			this.selectedDid = chooseDevice(devices, this.requestedDid)?.did ?? null;
		}
	}

	private publish(): void {
		const snapshot = this.snapshot();
		for (const listener of this.listeners) {
			try {
				listener(snapshot);
			} catch (error) {
				console.error("[devices] listener failed", error);
			}
		}
	}
}
