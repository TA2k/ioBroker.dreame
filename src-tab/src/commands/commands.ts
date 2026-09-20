/**
 * The commands the tab can send.
 *
 * ## Everything is a state write
 *
 * The dreame adapter has no message interface for control; it exposes trigger states under
 * `<did>.remote.` and acts when something writes to them unacknowledged. That is why
 * {@link TabConnection} has no `sendTo` - there would be nothing to send. The state ids and the
 * values are the ones the widget uses (`www/js/core/trigger.js`), so both views drive the robot
 * through exactly the same path.
 *
 * ## Why the values look arbitrary
 *
 * Some triggers take `true` and some take a JSON array of property writes, e.g.
 * `[{"piid":10,"value":"1,1"}]`. That is the device's own protocol surfacing: those commands are
 * SIID/PIID property writes rather than named actions, and the adapter passes them through. They
 * are copied from the widget rather than reconstructed, because a wrong piid is a command that
 * silently does something else.
 */

import type { TabConnection } from "../connection/types";

/** Builds the id of a trigger under `<did>.remote.`. */
export function remoteId(instanceId: string, did: string, suffix: string): string {
	return `${instanceId}.${did}.remote.${suffix}`;
}

/** The commands the header offers. */
export class DeviceCommands {
	public constructor(
		private readonly connection: TabConnection,
		private readonly instanceId: string,
		private readonly did: string,
	) {}

	/** Starts cleaning, or resumes a paused run - the adapter decides which applies. */
	public start(): Promise<void> {
		return this.trigger("startCleaning", true);
	}

	public stop(): Promise<void> {
		return this.trigger("stop", true);
	}

	public returnToDock(): Promise<void> {
		return this.trigger("return-to-dock", true);
	}

	public startWashing(): Promise<void> {
		return this.trigger("start-washing", true);
	}

	public startAutoEmpty(): Promise<void> {
		return this.trigger("start-auto-empty", true);
	}

	/** Mop drying on. The pair `3,1` is the device's own property write, not a made-up encoding. */
	public startDrying(): Promise<void> {
		return this.trigger("start-drying", JSON.stringify([{ piid: 10, value: "3,1" }]));
	}

	public stopDrying(): Promise<void> {
		return this.trigger("stop-drying", JSON.stringify([{ piid: 10, value: "3,0" }]));
	}

	/** Resets a wear part's counter. The suffix comes from `WEAR_PARTS`. */
	public resetWearPart(resetTrigger: string): Promise<void> {
		return this.trigger(resetTrigger, true);
	}

	public setCleaningMode(mode: number): Promise<void> {
		return this.trigger("cleaning-mode", mode);
	}

	/** Note the asymmetry: the route is read from `status.cleaning-route` but written here. */
	public setCleaningRoute(route: number): Promise<void> {
		return this.trigger("set-cleaning-route", route);
	}

	public setSuctionLevel(level: number): Promise<void> {
		return this.trigger("suction-level", level);
	}

	/** Wetness is a range from 1 to 32, not a list of named steps. */
	public setWetnessLevel(level: number): Promise<void> {
		return this.trigger("wetness-level", level);
	}

	/** Runs an app shortcut. The id is the segment under `<did>.shortcuts.`. */
	public startShortcut(shortcutId: string): Promise<void> {
		return this.connection.setState(`${this.instanceId}.${this.did}.shortcuts.${shortcutId}.start`, true);
	}

	/**
	 * Writes the cleaning sequence.
	 *
	 * A lasting value, not a trigger: the adapter sends it back, and the map draws what comes
	 * back rather than what was sent.
	 */
	public setSequenceOrder(order: readonly number[]): Promise<void> {
		return this.connection.setState(
			`${this.instanceId}.${this.did}.remote.cleaning-sequence.order`,
			JSON.stringify([...order]),
		);
	}

	/** Empties the sequence, so the next run covers everything again. */
	public clearSequence(): Promise<void> {
		return this.setSequenceOrder([]);
	}

	/** Turns a schedule on or off. Unlike the triggers, this state holds a lasting value. */
	public setScheduleEnabled(scheduleId: string, enabled: boolean): Promise<void> {
		return this.connection.setState(
			`${this.instanceId}.${this.did}.schedule.${scheduleId}.enabled`,
			enabled,
		);
	}

	private trigger(suffix: string, value: unknown): Promise<void> {
		return this.connection.setState(remoteId(this.instanceId, this.did, suffix), value);
	}
}
