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

import type { StateHandler, TabConnection } from "../connection/types";
import { roomCleaningId } from "../panels/roomSelection";

/** How long a room start waits for the adapter's acknowledgement before clearing the selection. */
export const START_ACK_TIMEOUT_MS = 15_000;

/**
 * Resolves when the adapter acknowledges a state, or after the timeout.
 *
 * Subscribes before returning, so the caller can write the state afterwards without the
 * acknowledgement slipping past in between. Never rejects: a missing acknowledgement is waited
 * out, not reported, since the command itself has been sent either way.
 */
export async function waitForAck(
	connection: TabConnection,
	stateId: string,
	timeoutMs: number,
): Promise<{ done: Promise<void>; cancel: () => void }> {
	let finish: () => void = () => undefined;
	const done = new Promise<void>(resolve => {
		finish = resolve;
	});
	// The socket hands a new subscriber the current value while subscribing - here the
	// acknowledgement of the previous start. Only what arrives after that counts.
	let armed = false;
	const handler: StateHandler = (_id, state) => {
		if (armed && state?.ack) finish();
	};
	const timer = setTimeout(() => finish(), timeoutMs);

	await connection.subscribe(stateId, handler);
	armed = true;
	return {
		done,
		cancel: () => {
			clearTimeout(timer);
			connection.unsubscribe(stateId, handler);
		},
	};
}

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

	/** Pauses a mop wash in progress, without ending the job it belongs to. */
	public pauseWashing(): Promise<void> {
		return this.trigger("pause-washing", JSON.stringify([{ piid: 10, value: "1,0" }]));
	}

	public resumeWashing(): Promise<void> {
		return this.trigger("resume-washing", JSON.stringify([{ piid: 10, value: "1,1" }]));
	}

	/** Resets the fresh water counter after the tank was filled - `config.tank`, not a trigger. */
	public resetTankCounter(): Promise<void> {
		return this.connection.setState(`${this.instanceId}.${this.did}.config.tank.wash-counter`, 0);
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

	/**
	 * Picks a room for the next start, or drops it.
	 *
	 * A lasting value like the sequence: the map shows the selection once the switch comes back.
	 */
	public setRoomSelected(switchStateId: string, selected: boolean): Promise<void> {
		return this.connection.setState(switchStateId, selected);
	}

	/**
	 * Cleans the selected rooms of one map, then clears the selection.
	 *
	 * The adapter cleans the rooms of the map named in `active-map`, so that is pointed at the
	 * map the rooms were picked on first - it may still name another floor. Only once the adapter
	 * has acknowledged the start, which it does after reading the switches and sending the
	 * command, are the switches cleared: clearing them any earlier could empty the selection
	 * before the adapter has read it. Should the acknowledgement not come, they are cleared after
	 * {@link START_ACK_TIMEOUT_MS} anyway - a start that went unanswered has been dealt with one
	 * way or another, and a selection left standing would quietly narrow the next start.
	 *
	 * @param switchStateIds the switches of every room of that map, selected or not
	 */
	public async startSelectedRooms(mapId: number, switchStateIds: readonly string[]): Promise<void> {
		const activeMapId = roomCleaningId(this.instanceId, this.did, "active-map");
		const startId = roomCleaningId(this.instanceId, this.did, "start");

		const activeMap = await this.connection.getState(activeMapId);
		if (String(activeMap?.val ?? "") !== String(mapId)) {
			await this.connection.setState(activeMapId, String(mapId));
		}

		const acknowledged = await waitForAck(this.connection, startId, START_ACK_TIMEOUT_MS);
		try {
			await this.connection.setState(startId, true);
			await acknowledged.done;
		} finally {
			acknowledged.cancel();
		}

		await Promise.all(switchStateIds.map(id => this.connection.setState(id, false)));
	}

	/** Turns a schedule on or off. Unlike the triggers, this state holds a lasting value. */
	public setScheduleEnabled(scheduleId: string, enabled: boolean): Promise<void> {
		return this.connection.setState(`${this.instanceId}.${this.did}.schedule.${scheduleId}.enabled`, enabled);
	}

	private trigger(suffix: string, value: unknown): Promise<void> {
		return this.connection.setState(remoteId(this.instanceId, this.did, suffix), value);
	}
}
